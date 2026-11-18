-- ============================================================
-- Migration 007: Bookings
-- Rural Mobility Super App — Varanasi, India
-- ============================================================

-- ENUM types
DO $$ BEGIN
  CREATE TYPE booking_request_status AS ENUM ('pending', 'accepted', 'rejected', 'cancelled', 'expired');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE confirmed_booking_status AS ENUM ('confirmed', 'picked_up', 'completed', 'cancelled', 'no_show');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE payment_method AS ENUM ('cash', 'upi', 'card', 'wallet');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE payment_status AS ENUM ('pending', 'paid', 'refunded', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- -------------------------------------------------------
-- Booking Requests
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS booking_requests (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  journey_id                UUID NOT NULL REFERENCES journeys(id) ON DELETE CASCADE,
  passenger_id              UUID NOT NULL REFERENCES passenger_profiles(id) ON DELETE CASCADE,
  seats_requested           INT NOT NULL DEFAULT 1,
  pickup_location           GEOMETRY(Point, 4326) NOT NULL,
  pickup_name               TEXT NOT NULL,
  dropoff_location          GEOMETRY(Point, 4326) NOT NULL,
  dropoff_name              TEXT NOT NULL,
  pickup_distance_m         INT,
  estimated_pickup_time     TIMESTAMPTZ,
  estimated_dropoff_time    TIMESTAMPTZ,
  route_compatibility_score DECIMAL(5,2),
  status                    booking_request_status NOT NULL DEFAULT 'pending',
  fare_estimate             DECIMAL(10,2),
  driver_response_at        TIMESTAMPTZ,
  expires_at                TIMESTAMPTZ,
  passenger_notes           TEXT,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_br_seats CHECK (seats_requested > 0 AND seats_requested <= 10),
  CONSTRAINT chk_br_pickup_dist CHECK (pickup_distance_m IS NULL OR pickup_distance_m >= 0),
  CONSTRAINT chk_br_compat CHECK (route_compatibility_score IS NULL OR
    (route_compatibility_score >= 0 AND route_compatibility_score <= 100))
);

COMMENT ON TABLE booking_requests IS 'Passenger requests to join a journey; expires after a TTL if driver does not respond';
COMMENT ON COLUMN booking_requests.route_compatibility_score IS 'Server-computed score 0–100 for how well passenger route matches journey route';
COMMENT ON COLUMN booking_requests.expires_at IS 'Set by server; request auto-cancels after this time if no driver response';

DROP TRIGGER IF EXISTS trg_booking_requests_updated_at ON booking_requests;
CREATE TRIGGER trg_booking_requests_updated_at
  BEFORE UPDATE ON booking_requests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- -------------------------------------------------------
-- Confirmed Bookings
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS confirmed_bookings (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id          UUID NOT NULL UNIQUE REFERENCES booking_requests(id) ON DELETE RESTRICT,
  journey_id          UUID NOT NULL REFERENCES journeys(id) ON DELETE RESTRICT,
  passenger_id        UUID NOT NULL REFERENCES passenger_profiles(id) ON DELETE RESTRICT,
  driver_id           UUID NOT NULL REFERENCES driver_profiles(id) ON DELETE RESTRICT,
  seats_booked        INT NOT NULL,
  confirmed_fare      DECIMAL(10,2) NOT NULL,
  pickup_name         TEXT,
  dropoff_name        TEXT,
  status              confirmed_booking_status NOT NULL DEFAULT 'confirmed',
  payment_method      payment_method NOT NULL DEFAULT 'cash',
  payment_status      payment_status NOT NULL DEFAULT 'pending',
  pickup_time         TIMESTAMPTZ,
  dropoff_time        TIMESTAMPTZ,
  cancellation_reason TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_cb_seats        CHECK (seats_booked > 0 AND seats_booked <= 10),
  CONSTRAINT chk_cb_fare         CHECK (confirmed_fare >= 0)
);

COMMENT ON TABLE confirmed_bookings IS 'Finalized booking after driver accepts a request; seat is atomically reserved';

DROP TRIGGER IF EXISTS trg_confirmed_bookings_updated_at ON confirmed_bookings;
CREATE TRIGGER trg_confirmed_bookings_updated_at
  BEFORE UPDATE ON confirmed_bookings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- -------------------------------------------------------
-- Atomic Seat Reservation Function
-- Decrements available_seats in a single atomic UPDATE,
-- returns TRUE on success, FALSE if not enough seats.
-- Call inside a transaction before inserting confirmed_booking.
-- -------------------------------------------------------
CREATE OR REPLACE FUNCTION reserve_seat(p_journey_id UUID, p_seats INT)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
DECLARE
  v_updated INT;
BEGIN
  UPDATE journeys
  SET
    available_seats = available_seats - p_seats,
    updated_at      = NOW()
  WHERE
    id              = p_journey_id
    AND status      = 'active'
    AND available_seats >= p_seats
    AND accepts_new_passengers = true;

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  RETURN v_updated > 0;
END;
$$;

COMMENT ON FUNCTION reserve_seat IS
  'Atomically reserve p_seats on a journey. Returns true if successful, false if seats unavailable or journey not active. Must be called inside a transaction.';

-- -------------------------------------------------------
-- Corresponding release function (for cancellations)
-- -------------------------------------------------------
CREATE OR REPLACE FUNCTION release_seat(p_journey_id UUID, p_seats INT)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE journeys
  SET
    available_seats = LEAST(available_seats + p_seats, total_seats),
    updated_at      = NOW()
  WHERE id = p_journey_id;
END;
$$;

COMMENT ON FUNCTION release_seat IS
  'Release reserved seats back to journey when booking is cancelled. Caps at total_seats.';
