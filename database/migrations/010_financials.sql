-- ============================================================
-- Migration 010: Driver Financials (Earnings & Expenses)
-- Rural Mobility Super App — Varanasi, India
-- ============================================================

-- ENUM types
DO $$ BEGIN
  CREATE TYPE expense_type AS ENUM ('fuel', 'maintenance', 'toll', 'permit', 'insurance', 'other');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- -------------------------------------------------------
-- Driver Earnings
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS driver_earnings (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id      UUID NOT NULL REFERENCES driver_profiles(id) ON DELETE CASCADE,
  booking_id     UUID REFERENCES confirmed_bookings(id) ON DELETE SET NULL,
  journey_id     UUID REFERENCES journeys(id) ON DELETE SET NULL,
  gross_amount   DECIMAL(10,2) NOT NULL,
  platform_fee   DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  net_amount     DECIMAL(10,2) NOT NULL,
  earned_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_de_gross    CHECK (gross_amount >= 0),
  CONSTRAINT chk_de_fee      CHECK (platform_fee >= 0),
  CONSTRAINT chk_de_net      CHECK (net_amount >= 0),
  CONSTRAINT chk_de_net_math CHECK (net_amount = gross_amount - platform_fee)
);

COMMENT ON TABLE driver_earnings IS 'Per-booking net earnings for each driver in INR; source of truth for payout calculation';
COMMENT ON COLUMN driver_earnings.gross_amount IS 'Full fare paid by passenger';
COMMENT ON COLUMN driver_earnings.net_amount IS 'gross_amount - platform_fee; what driver actually earns';

-- -------------------------------------------------------
-- Driver Expenses
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS driver_expenses (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id    UUID NOT NULL REFERENCES driver_profiles(id) ON DELETE CASCADE,
  expense_type expense_type NOT NULL,
  amount       DECIMAL(10,2) NOT NULL,
  description  TEXT,
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  journey_id   UUID REFERENCES journeys(id) ON DELETE SET NULL,
  receipt_url  TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_dexp_amount CHECK (amount > 0)
);

COMMENT ON TABLE driver_expenses IS 'Self-reported driver expenses for P&L tracking; not verified by platform';
COMMENT ON COLUMN driver_expenses.journey_id IS 'Optional link to a specific journey (e.g. toll paid during a trip)';
COMMENT ON COLUMN driver_expenses.receipt_url IS 'Optional uploaded receipt image URL';

DROP TRIGGER IF EXISTS trg_driver_expenses_updated_at ON driver_expenses;
CREATE TRIGGER trg_driver_expenses_updated_at
  BEFORE UPDATE ON driver_expenses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- -------------------------------------------------------
-- Convenience view: driver P&L summary per day
-- -------------------------------------------------------
CREATE OR REPLACE VIEW driver_daily_pnl AS
SELECT
  de.driver_id,
  de.earned_at::DATE                   AS earning_date,
  COALESCE(SUM(de.gross_amount), 0)    AS total_gross,
  COALESCE(SUM(de.platform_fee), 0)    AS total_fees,
  COALESCE(SUM(de.net_amount), 0)      AS total_net_earnings,
  COALESCE(exp.total_expenses, 0)      AS total_expenses,
  COALESCE(SUM(de.net_amount), 0)
    - COALESCE(exp.total_expenses, 0)  AS net_profit
FROM driver_earnings de
LEFT JOIN (
  SELECT driver_id, expense_date, SUM(amount) AS total_expenses
  FROM driver_expenses
  GROUP BY driver_id, expense_date
) exp ON exp.driver_id = de.driver_id AND exp.expense_date = de.earned_at::DATE
GROUP BY de.driver_id, de.earned_at::DATE, exp.total_expenses;

COMMENT ON VIEW driver_daily_pnl IS 'Daily profit/loss per driver: net earnings minus self-reported expenses';
