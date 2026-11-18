-- ============================================================
-- Migration 003: Passenger & Driver Profiles
-- Rural Mobility Super App — Varanasi, India
-- ============================================================

-- ENUM for subscription plan (used in driver_profiles)
DO $$ BEGIN
  CREATE TYPE subscription_plan_type AS ENUM ('free', 'pro', 'premium');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- -------------------------------------------------------
-- Passenger Profiles
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS passenger_profiles (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  full_name           VARCHAR(100),
  profile_photo_url   TEXT,
  home_location       GEOMETRY(Point, 4326),
  home_address        TEXT,
  emergency_contacts  JSONB DEFAULT '[]'::JSONB,
  total_rides         INT NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_passenger_user UNIQUE (user_id)
);

COMMENT ON TABLE passenger_profiles IS 'Extended profile data for passengers';
COMMENT ON COLUMN passenger_profiles.emergency_contacts IS 'JSON array of {name: string, phone: string} objects';
COMMENT ON COLUMN passenger_profiles.home_location IS 'PostGIS Point (SRID 4326) for home address geo';

DROP TRIGGER IF EXISTS trg_passenger_profiles_updated_at ON passenger_profiles;
CREATE TRIGGER trg_passenger_profiles_updated_at
  BEFORE UPDATE ON passenger_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- -------------------------------------------------------
-- Driver Profiles
-- Note: vehicle_id FK is added after vehicles table is created (006 would need a deferred FK or the
-- column is added in 004_vehicles.sql via ALTER TABLE). We declare it nullable here and the FK
-- constraint is added in 004_vehicles.sql with IF NOT EXISTS guard.
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS driver_profiles (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  full_name               VARCHAR(100) NOT NULL,
  profile_photo_url       TEXT,
  date_of_birth           DATE,
  address                 TEXT,
  vehicle_id              UUID,                  -- FK added in 004_vehicles.sql
  is_verified             BOOLEAN NOT NULL DEFAULT false,
  is_online               BOOLEAN NOT NULL DEFAULT false,
  current_location        GEOMETRY(Point, 4326),
  location_updated_at     TIMESTAMPTZ,
  rating                  DECIMAL(3,2) NOT NULL DEFAULT 5.00,
  total_ratings           INT NOT NULL DEFAULT 0,
  subscription_plan       subscription_plan_type NOT NULL DEFAULT 'free',
  subscription_expires_at TIMESTAMPTZ,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_driver_user UNIQUE (user_id),
  CONSTRAINT chk_driver_rating CHECK (rating >= 1.00 AND rating <= 5.00)
);

COMMENT ON TABLE driver_profiles IS 'Extended profile data for drivers including real-time location';
COMMENT ON COLUMN driver_profiles.current_location IS 'PostGIS Point (SRID 4326) updated by driver app in real-time';
COMMENT ON COLUMN driver_profiles.rating IS 'Aggregate rating 1.00–5.00, updated after each booking review';

DROP TRIGGER IF EXISTS trg_driver_profiles_updated_at ON driver_profiles;
CREATE TRIGGER trg_driver_profiles_updated_at
  BEFORE UPDATE ON driver_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
