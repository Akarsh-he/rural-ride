-- ============================================================
-- Migration 012: Notifications & Device Tokens
-- Rural Mobility Super App — Varanasi, India
-- ============================================================

-- ENUM types
DO $$ BEGIN
  CREATE TYPE notification_type AS ENUM (
    'booking_request',
    'booking_accepted',
    'booking_rejected',
    'booking_cancelled',
    'booking_completed',
    'driver_arrived',
    'journey_started',
    'journey_completed',
    'payment_received',
    'payment_failed',
    'subscription_expiring',
    'document_expiring',
    'document_approved',
    'document_rejected',
    'promo',
    'system'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE device_platform AS ENUM ('android', 'ios', 'web');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- -------------------------------------------------------
-- Notifications
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS notifications (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type       notification_type NOT NULL,
  title      TEXT NOT NULL,
  body       TEXT NOT NULL,
  data       JSONB DEFAULT '{}'::JSONB,
  is_read    BOOLEAN NOT NULL DEFAULT false,
  sent_at    TIMESTAMPTZ,
  read_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE notifications IS 'In-app and push notification records; retained for 90 days';
COMMENT ON COLUMN notifications.data IS 'Optional extra context, e.g. {booking_id, journey_id} for deep linking';
COMMENT ON COLUMN notifications.sent_at IS 'When FCM/APNs delivery was attempted; NULL = queued but not yet sent';

-- -------------------------------------------------------
-- Device Tokens (for Firebase Cloud Messaging)
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS device_tokens (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token      TEXT NOT NULL,
  platform   device_platform NOT NULL,
  is_active  BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_device_token UNIQUE (token)
);

COMMENT ON TABLE device_tokens IS 'FCM/APNs device registration tokens; a user may have multiple active devices';
COMMENT ON COLUMN device_tokens.token IS 'FCM registration token; invalidated tokens are marked is_active=false';

DROP TRIGGER IF EXISTS trg_device_tokens_updated_at ON device_tokens;
CREATE TRIGGER trg_device_tokens_updated_at
  BEFORE UPDATE ON device_tokens
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
