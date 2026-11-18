-- ============================================================
-- Migration 002: Users Table
-- Rural Mobility Super App — Varanasi, India
-- ============================================================

-- ENUM types (idempotent)
DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('passenger', 'driver', 'admin', 'support');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE user_status AS ENUM ('active', 'suspended', 'pending', 'deleted');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE preferred_language AS ENUM ('hi', 'en');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone              VARCHAR(15) UNIQUE NOT NULL,
  phone_verified     BOOLEAN NOT NULL DEFAULT false,
  email              VARCHAR(255) UNIQUE,
  firebase_uid       VARCHAR(128) UNIQUE,
  role               user_role NOT NULL,
  status             user_status NOT NULL DEFAULT 'pending',
  preferred_language preferred_language NOT NULL DEFAULT 'hi',
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at       TIMESTAMPTZ
);

-- Auto-update updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_users_updated_at ON users;
CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE users IS 'Core user accounts for all roles in the Rural Mobility platform';
COMMENT ON COLUMN users.phone IS 'E.164 format phone number, primary login credential';
COMMENT ON COLUMN users.firebase_uid IS 'Firebase Authentication UID for OTP-based login';
