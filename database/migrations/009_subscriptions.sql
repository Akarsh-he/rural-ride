-- ============================================================
-- Migration 009: Subscription Plans & Driver Subscriptions
-- Rural Mobility Super App — Varanasi, India
-- ============================================================

-- ENUM types
DO $$ BEGIN
  CREATE TYPE driver_subscription_status AS ENUM ('active', 'cancelled', 'expired', 'trial');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- -------------------------------------------------------
-- Subscription Plans (master table)
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS subscription_plans (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name           VARCHAR(50) NOT NULL UNIQUE,
  display_name   VARCHAR(100),
  price_monthly  DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  price_yearly   DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  features       JSONB DEFAULT '{}'::JSONB,
  is_active      BOOLEAN NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_sp_monthly CHECK (price_monthly >= 0),
  CONSTRAINT chk_sp_yearly  CHECK (price_yearly >= 0)
);

COMMENT ON TABLE subscription_plans IS 'Platform subscription tiers available to drivers';
COMMENT ON COLUMN subscription_plans.features IS 'JSON object describing plan features, e.g. {demand_heatmap: true, priority_listing: false}';

DROP TRIGGER IF EXISTS trg_subscription_plans_updated_at ON subscription_plans;
CREATE TRIGGER trg_subscription_plans_updated_at
  BEFORE UPDATE ON subscription_plans
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- -------------------------------------------------------
-- Seed Default Plans
-- -------------------------------------------------------
INSERT INTO subscription_plans (id, name, display_name, price_monthly, price_yearly, features, is_active)
VALUES
  (
    gen_random_uuid(),
    'free',
    'Free Plan',
    0.00,
    0.00,
    '{"demand_heatmap": false, "priority_listing": false, "analytics": false, "ads_shown": true, "support_level": "basic"}'::JSONB,
    true
  ),
  (
    gen_random_uuid(),
    'pro',
    'Pro Plan',
    99.00,
    999.00,
    '{"demand_heatmap": true, "priority_listing": true, "analytics": "basic", "ads_shown": false, "support_level": "priority", "max_active_journeys": 3}'::JSONB,
    true
  ),
  (
    gen_random_uuid(),
    'premium',
    'Premium Plan',
    199.00,
    1999.00,
    '{"demand_heatmap": true, "priority_listing": true, "analytics": "advanced", "ads_shown": false, "support_level": "dedicated", "max_active_journeys": 10, "return_journey_alerts": true}'::JSONB,
    true
  )
ON CONFLICT (name) DO NOTHING;

-- -------------------------------------------------------
-- Driver Subscriptions
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS driver_subscriptions (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id               UUID NOT NULL UNIQUE REFERENCES driver_profiles(id) ON DELETE CASCADE,
  plan_id                 UUID NOT NULL REFERENCES subscription_plans(id) ON DELETE RESTRICT,
  status                  driver_subscription_status NOT NULL DEFAULT 'trial',
  started_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at              TIMESTAMPTZ,
  auto_renew              BOOLEAN NOT NULL DEFAULT false,
  payment_transaction_id  UUID REFERENCES payment_transactions(id) ON DELETE SET NULL,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE driver_subscriptions IS 'Active subscription for each driver; one row per driver (UNIQUE on driver_id)';

DROP TRIGGER IF EXISTS trg_driver_subscriptions_updated_at ON driver_subscriptions;
CREATE TRIGGER trg_driver_subscriptions_updated_at
  BEFORE UPDATE ON driver_subscriptions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
