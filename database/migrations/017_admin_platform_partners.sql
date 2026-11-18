-- ============================================================
-- Migration 017: Admin, Platform Settings, Partners & Maintenance
-- Rural Mobility Super App — Varanasi, India
-- ============================================================

-- -------------------------------------------------------
-- 1. Admin Accounts
-- -------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE admin_role AS ENUM ('super_admin', 'operations_admin', 'support_admin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS admin_accounts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  name          VARCHAR(100) NOT NULL,
  role          admin_role NOT NULL DEFAULT 'operations_admin',
  is_active     BOOLEAN NOT NULL DEFAULT true,
  last_login_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- -------------------------------------------------------
-- 2. Admin Audit Logs
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS admin_audit_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id    UUID REFERENCES admin_accounts(id) ON DELETE SET NULL,
  admin_email VARCHAR(255) NOT NULL,
  action      VARCHAR(100) NOT NULL,
  target_type VARCHAR(50) NOT NULL,
  target_id   VARCHAR(100),
  details     JSONB,
  ip_address  VARCHAR(45),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_admin_id ON admin_audit_logs(admin_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON admin_audit_logs(created_at DESC);

-- -------------------------------------------------------
-- 3. Business Partners
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS business_partners (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            VARCHAR(255) NOT NULL,
  contact_person  VARCHAR(100),
  phone           VARCHAR(20),
  email           VARCHAR(255),
  category        VARCHAR(100), -- 'fuel_station', 'service_center', 'insurance', 'local_store'
  address         TEXT,
  commission_rate DECIMAL(5,2) DEFAULT 0.00,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- -------------------------------------------------------
-- 4. Vehicle Maintenance Records
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS vehicle_maintenance_records (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id       UUID REFERENCES vehicles(id) ON DELETE CASCADE,
  driver_id        UUID REFERENCES driver_profiles(id) ON DELETE CASCADE,
  maintenance_type VARCHAR(100) NOT NULL, -- 'oil_change', 'tyre_replacement', 'cng_kit_tuning', 'repair'
  cost             DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  description      TEXT,
  service_center   VARCHAR(255),
  odometer_km      INT,
  maintenance_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_maintenance_vehicle_id ON vehicle_maintenance_records(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_maintenance_driver_id ON vehicle_maintenance_records(driver_id);

-- -------------------------------------------------------
-- 5. Platform Settings / Config
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS platform_settings (
  key         VARCHAR(100) PRIMARY KEY,
  value       JSONB NOT NULL,
  description TEXT,
  updated_by  UUID REFERENCES admin_accounts(id) ON DELETE SET NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- -------------------------------------------------------
-- 6. Ad Events (Real Impression & Click Tracking)
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS ad_events (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ad_id      UUID REFERENCES advertisements(id) ON DELETE CASCADE,
  event_type VARCHAR(20) NOT NULL, -- 'impression', 'click'
  user_id    UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ad_events_ad_id ON ad_events(ad_id, event_type);
CREATE INDEX IF NOT EXISTS idx_ad_events_created_at ON ad_events(created_at DESC);

-- Trigger for admin_accounts updated_at
DROP TRIGGER IF EXISTS trg_admin_accounts_updated_at ON admin_accounts;
CREATE TRIGGER trg_admin_accounts_updated_at
  BEFORE UPDATE ON admin_accounts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Trigger for business_partners updated_at
DROP TRIGGER IF EXISTS trg_business_partners_updated_at ON business_partners;
CREATE TRIGGER trg_business_partners_updated_at
  BEFORE UPDATE ON business_partners
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
