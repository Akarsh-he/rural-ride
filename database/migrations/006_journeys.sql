-- ============================================================
-- Migration 006: Journeys
-- Rural Mobility Super App — Varanasi, India
-- ============================================================

-- ENUM types
DO $$ BEGIN
  CREATE TYPE journey_status AS ENUM ('scheduled', 'active', 'completed', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE journey_type AS ENUM ('shared', 'private');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- -------------------------------------------------------
-- Journeys
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS journeys (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id               UUID NOT NULL REFERENCES driver_profiles(id) ON DELETE RESTRICT,
  vehicle_id              UUID NOT NULL REFERENCES vehicles(id) ON DELETE RESTRICT,
  status                  journey_status NOT NULL DEFAULT 'scheduled',
  journey_type            journey_type NOT NULL DEFAULT 'shared',
  origin_name             TEXT NOT NULL,
  origin_location         GEOMETRY(Point, 4326) NOT NULL,
  destination_name        TEXT NOT NULL,
  destination_location    GEOMETRY(Point, 4326) NOT NULL,
  route_geometry          GEOMETRY(LineString, 4326),
  waypoints               JSONB DEFAULT '[]'::JSONB,
  total_distance_km       DECIMAL(8,2),
  departure_time          TIMESTAMPTZ,
  estimated_arrival_time  TIMESTAMPTZ,
  actual_start_time       TIMESTAMPTZ,
  actual_end_time         TIMESTAMPTZ,
  total_seats             INT NOT NULL,
  available_seats         INT NOT NULL,
  base_fare_per_km        DECIMAL(8,2),
  minimum_fare            DECIMAL(8,2),
  accepts_new_passengers  BOOLEAN NOT NULL DEFAULT true,
  platform_commission_pct DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  notes                   TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_journeys_seats
    CHECK (available_seats >= 0 AND available_seats <= total_seats),
  CONSTRAINT chk_journeys_total_seats
    CHECK (total_seats > 0 AND total_seats <= 10),
  CONSTRAINT chk_journeys_commission
    CHECK (platform_commission_pct >= 0 AND platform_commission_pct <= 100)
);

COMMENT ON TABLE journeys IS 'A single journey operated by a driver; may be shared or private';
COMMENT ON COLUMN journeys.route_geometry IS 'PostGIS LineString of the actual/planned route path for proximity matching';
COMMENT ON COLUMN journeys.waypoints IS 'Optional ordered array of intermediate stop coords [{lat, lng, name}]';
COMMENT ON COLUMN journeys.available_seats IS 'Decremented atomically when a booking is confirmed; never goes below 0';

DROP TRIGGER IF EXISTS trg_journeys_updated_at ON journeys;
CREATE TRIGGER trg_journeys_updated_at
  BEFORE UPDATE ON journeys
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- -------------------------------------------------------
-- Journey Location Updates (GPS breadcrumb trail)
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS journey_location_updates (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  journey_id  UUID NOT NULL REFERENCES journeys(id) ON DELETE CASCADE,
  location    GEOMETRY(Point, 4326) NOT NULL,
  speed_kmh   DECIMAL(5,2),
  heading     DECIMAL(5,2),
  recorded_at TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_jlu_speed   CHECK (speed_kmh IS NULL OR speed_kmh >= 0),
  CONSTRAINT chk_jlu_heading CHECK (heading IS NULL OR (heading >= 0 AND heading < 360))
);

COMMENT ON TABLE journey_location_updates IS 'Real-time GPS breadcrumb trail for active journeys; retained for 30 days';

-- -------------------------------------------------------
-- Journey Stops
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS journey_stops (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  journey_id       UUID NOT NULL REFERENCES journeys(id) ON DELETE CASCADE,
  stop_name        TEXT NOT NULL,
  location         GEOMETRY(Point, 4326) NOT NULL,
  stop_order       INT NOT NULL,
  estimated_arrival TIMESTAMPTZ,
  actual_arrival   TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_journey_stop_order UNIQUE (journey_id, stop_order)
);

COMMENT ON TABLE journey_stops IS 'Named stops along a journey route in ordered sequence';
