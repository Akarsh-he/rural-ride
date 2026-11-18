-- ============================================================
-- Migration 004: Vehicles
-- Rural Mobility Super App — Varanasi, India
-- ============================================================

-- ENUM types
DO $$ BEGIN
  CREATE TYPE vehicle_type AS ENUM ('auto_rickshaw', 'e_rickshaw', 'bike', 'private_car', 'tempo');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE fuel_type AS ENUM ('petrol', 'diesel', 'cng', 'electric', 'hybrid');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- -------------------------------------------------------
-- Vehicles Table
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS vehicles (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id           UUID NOT NULL REFERENCES driver_profiles(id) ON DELETE CASCADE,
  vehicle_type        vehicle_type NOT NULL,
  registration_number VARCHAR(20) UNIQUE NOT NULL,
  make                VARCHAR(50),
  model               VARCHAR(50),
  year                INT,
  color               VARCHAR(30),
  max_passengers      INT NOT NULL,
  fuel_type           fuel_type,
  photo_urls          JSONB DEFAULT '[]'::JSONB,
  is_active           BOOLEAN NOT NULL DEFAULT true,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_vehicles_max_passengers CHECK (max_passengers > 0 AND max_passengers <= 10),
  CONSTRAINT chk_vehicles_year CHECK (year IS NULL OR (year >= 1980 AND year <= EXTRACT(YEAR FROM NOW()) + 1))
);

COMMENT ON TABLE vehicles IS 'Registered vehicles for drivers; each driver may have multiple vehicles but only one active at a time';
COMMENT ON COLUMN vehicles.photo_urls IS 'JSON array of photo URL strings';
COMMENT ON COLUMN vehicles.registration_number IS 'Indian vehicle registration plate number (e.g. UP65AZ1234)';

DROP TRIGGER IF EXISTS trg_vehicles_updated_at ON vehicles;
CREATE TRIGGER trg_vehicles_updated_at
  BEFORE UPDATE ON vehicles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- -------------------------------------------------------
-- Add FK from driver_profiles.vehicle_id → vehicles
-- (driver_profiles was created before vehicles, so we
--  add the constraint here, idempotently)
-- -------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_driver_profiles_vehicle_id'
  ) THEN
    ALTER TABLE driver_profiles
      ADD CONSTRAINT fk_driver_profiles_vehicle_id
      FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE SET NULL;
  END IF;
END $$;
