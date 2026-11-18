-- ============================================================
-- Migration 014: Support Tickets & Messages
-- Rural Mobility Super App — Varanasi, India
-- ============================================================

-- ENUM types
DO $$ BEGIN
  CREATE TYPE support_category AS ENUM (
    'payment_issue',
    'booking_issue',
    'driver_complaint',
    'passenger_complaint',
    'account_issue',
    'app_bug',
    'document_issue',
    'subscription_issue',
    'other'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE support_status AS ENUM ('open', 'in_progress', 'waiting_on_user', 'resolved', 'closed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE support_priority AS ENUM ('low', 'medium', 'high', 'urgent');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- -------------------------------------------------------
-- Support Tickets
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS support_tickets (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  booking_id  UUID REFERENCES confirmed_bookings(id) ON DELETE SET NULL,
  category    support_category NOT NULL,
  subject     TEXT NOT NULL,
  description TEXT NOT NULL,
  status      support_status NOT NULL DEFAULT 'open',
  priority    support_priority NOT NULL DEFAULT 'medium',
  assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,
  resolution  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE support_tickets IS 'User-raised support tickets; assigned to support agents for resolution';
COMMENT ON COLUMN support_tickets.assigned_to IS 'Support agent (users.role=support or admin) assigned to this ticket';

DROP TRIGGER IF EXISTS trg_support_tickets_updated_at ON support_tickets;
CREATE TRIGGER trg_support_tickets_updated_at
  BEFORE UPDATE ON support_tickets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- -------------------------------------------------------
-- Support Messages (threaded conversation per ticket)
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS support_messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id   UUID NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  sender_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message     TEXT NOT NULL,
  attachments JSONB DEFAULT '[]'::JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE support_messages IS 'Threaded conversation messages within a support ticket';
COMMENT ON COLUMN support_messages.attachments IS 'JSON array of attachment URLs for screenshots, receipts, etc.';
