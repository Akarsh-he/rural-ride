-- ============================================================
-- Migration 008: Payment Transactions
-- Rural Mobility Super App — Varanasi, India
-- ============================================================

-- ENUM types
DO $$ BEGIN
  CREATE TYPE transaction_status AS ENUM ('initiated', 'pending', 'success', 'failed', 'refunded');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- -------------------------------------------------------
-- Payment Transactions
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS payment_transactions (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id             UUID REFERENCES confirmed_bookings(id) ON DELETE SET NULL,
  payer_id               UUID REFERENCES users(id) ON DELETE SET NULL,
  payee_driver_id        UUID REFERENCES driver_profiles(id) ON DELETE SET NULL,
  amount                 DECIMAL(10,2) NOT NULL,
  platform_fee           DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  driver_payout          DECIMAL(10,2),
  payment_method         payment_method,
  payment_gateway        VARCHAR(50),
  gateway_transaction_id VARCHAR(255),
  gateway_order_id       VARCHAR(255),
  status                 transaction_status NOT NULL DEFAULT 'initiated',
  refund_amount          DECIMAL(10,2),
  refund_reason          TEXT,
  metadata               JSONB DEFAULT '{}'::JSONB,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_pt_amount       CHECK (amount > 0),
  CONSTRAINT chk_pt_platform_fee CHECK (platform_fee >= 0),
  CONSTRAINT chk_pt_payout       CHECK (driver_payout IS NULL OR driver_payout >= 0),
  CONSTRAINT chk_pt_refund       CHECK (refund_amount IS NULL OR refund_amount >= 0)
);

COMMENT ON TABLE payment_transactions IS 'All payment events in INR; supports cash, UPI (Razorpay), card, and wallet';
COMMENT ON COLUMN payment_transactions.gateway_transaction_id IS 'Razorpay payment_id or equivalent gateway reference';
COMMENT ON COLUMN payment_transactions.gateway_order_id IS 'Razorpay order_id or equivalent';
COMMENT ON COLUMN payment_transactions.metadata IS 'Raw gateway response payload (do NOT store card numbers or CVV)';
COMMENT ON COLUMN payment_transactions.driver_payout IS 'amount - platform_fee; computed at settlement time';

DROP TRIGGER IF EXISTS trg_payment_transactions_updated_at ON payment_transactions;
CREATE TRIGGER trg_payment_transactions_updated_at
  BEFORE UPDATE ON payment_transactions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
