-- ============================================================
-- Migration 005: Driver Verification
-- Rural Mobility Super App — Varanasi, India
-- ============================================================

-- ENUM types
DO $$ BEGIN
  CREATE TYPE document_type AS ENUM ('aadhaar', 'pan', 'dl', 'rc', 'permit', 'insurance', 'fitness');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE verification_status AS ENUM ('pending', 'under_review', 'approved', 'rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE reminder_type AS ENUM ('insurance', 'permit', 'fitness', 'dl_renewal');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- -------------------------------------------------------
-- Driver Verifications
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS driver_verifications (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id       UUID NOT NULL REFERENCES driver_profiles(id) ON DELETE CASCADE,
  document_type   document_type NOT NULL,
  document_number VARCHAR(50),
  document_url    TEXT,
  status          verification_status NOT NULL DEFAULT 'pending',
  reviewed_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  review_notes    TEXT,
  expires_at      DATE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_driver_document UNIQUE (driver_id, document_type)
);

COMMENT ON TABLE driver_verifications IS 'KYC and vehicle document submissions; one record per document type per driver';
COMMENT ON COLUMN driver_verifications.document_url IS 'Secure URL to uploaded document scan (stored in cloud storage)';
COMMENT ON COLUMN driver_verifications.reviewed_by IS 'Admin or support user who reviewed the document';

DROP TRIGGER IF EXISTS trg_driver_verifications_updated_at ON driver_verifications;
CREATE TRIGGER trg_driver_verifications_updated_at
  BEFORE UPDATE ON driver_verifications
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- -------------------------------------------------------
-- Verification Reminders
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS verification_reminders (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id     UUID NOT NULL REFERENCES driver_profiles(id) ON DELETE CASCADE,
  reminder_type reminder_type NOT NULL,
  expires_at    DATE NOT NULL,
  is_notified   BOOLEAN NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE verification_reminders IS 'Scheduled reminders for expiring documents (insurance, permit, fitness, DL)';
COMMENT ON COLUMN verification_reminders.is_notified IS 'Set true after notification has been sent; prevents duplicate alerts';
