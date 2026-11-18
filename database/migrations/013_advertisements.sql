-- ============================================================
-- Migration 013: Advertisements
-- Rural Mobility Super App — Varanasi, India
-- ============================================================

-- ENUM types
DO $$ BEGIN
  CREATE TYPE ad_type AS ENUM ('banner', 'sponsored_listing', 'featured');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE ad_status AS ENUM ('draft', 'active', 'paused', 'expired');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- -------------------------------------------------------
-- Advertisements
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS advertisements (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  advertiser_name     TEXT NOT NULL,
  business_category   TEXT,
  ad_type             ad_type NOT NULL,
  title               TEXT NOT NULL,
  description         TEXT,
  image_url           TEXT,
  target_url          TEXT,
  target_area         GEOMETRY(Polygon, 4326),
  budget              DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  cost_per_impression DECIMAL(10,4) NOT NULL DEFAULT 0.00,
  impressions         INT NOT NULL DEFAULT 0,
  clicks              INT NOT NULL DEFAULT 0,
  status              ad_status NOT NULL DEFAULT 'draft',
  starts_at           TIMESTAMPTZ,
  ends_at             TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_ad_budget CHECK (budget >= 0),
  CONSTRAINT chk_ad_cpi    CHECK (cost_per_impression >= 0),
  CONSTRAINT chk_ad_impressions CHECK (impressions >= 0),
  CONSTRAINT chk_ad_clicks      CHECK (clicks >= 0 AND clicks <= impressions),
  CONSTRAINT chk_ad_dates       CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at > starts_at)
);

COMMENT ON TABLE advertisements IS 'Geo-targeted ads shown to passengers; revenue model for free-tier drivers';
COMMENT ON COLUMN advertisements.target_area IS 'PostGIS Polygon (SRID 4326) defining the geo-fence where the ad is shown';
COMMENT ON COLUMN advertisements.budget IS 'Total INR budget; ad pauses when spend reaches budget';
COMMENT ON COLUMN advertisements.cost_per_impression IS 'INR charged to advertiser per impression (CPM-style)';

DROP TRIGGER IF EXISTS trg_advertisements_updated_at ON advertisements;
CREATE TRIGGER trg_advertisements_updated_at
  BEFORE UPDATE ON advertisements
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
