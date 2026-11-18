-- ============================================================
-- Seed 001: Varanasi Reference Locations
-- Rural Mobility Super App — Varanasi, India
-- ============================================================
-- Well-known landmarks with accurate WGS84 coordinates
-- district: Varanasi / Chandauli / Sant Ravidas Nagar

CREATE TABLE IF NOT EXISTS reference_locations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  name_hi       TEXT,
  location      GEOMETRY(Point, 4326) NOT NULL,
  location_type TEXT NOT NULL,  -- 'railway_station','ghat','crossing','university','airport','town','village','area'
  district      TEXT NOT NULL DEFAULT 'Varanasi',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ref_loc_location ON reference_locations USING GIST(location);
CREATE INDEX IF NOT EXISTS idx_ref_loc_type     ON reference_locations(location_type);

-- Insert landmark data (idempotent via ON CONFLICT DO NOTHING with UNIQUE name)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_ref_loc_name') THEN
    ALTER TABLE reference_locations ADD CONSTRAINT uq_ref_loc_name UNIQUE (name);
  END IF;
END $$;

INSERT INTO reference_locations (name, name_hi, location, location_type, district) VALUES
  (
    'Varanasi Junction',
    'वाराणसी जंक्शन',
    ST_SetSRID(ST_MakePoint(82.9739, 25.3176), 4326),
    'railway_station',
    'Varanasi'
  ),
  (
    'Varanasi Cantt',
    'वाराणसी छावनी',
    ST_SetSRID(ST_MakePoint(82.9637, 25.2990), 4326),
    'railway_station',
    'Varanasi'
  ),
  (
    'BHU (Banaras Hindu University)',
    'बनारस हिंदू विश्वविद्यालय',
    ST_SetSRID(ST_MakePoint(82.9913, 25.2677), 4326),
    'university',
    'Varanasi'
  ),
  (
    'Dashashwamedh Ghat',
    'दशाश्वमेध घाट',
    ST_SetSRID(ST_MakePoint(82.9870, 25.3085), 4326),
    'ghat',
    'Varanasi'
  ),
  (
    'Godaulia Chowk',
    'गोदौलिया चौक',
    ST_SetSRID(ST_MakePoint(82.9841, 25.3080), 4326),
    'crossing',
    'Varanasi'
  ),
  (
    'Lanka Crossing',
    'लंका चौराहा',
    ST_SetSRID(ST_MakePoint(82.9940, 25.2650), 4326),
    'crossing',
    'Varanasi'
  ),
  (
    'Sarnath',
    'सारनाथ',
    ST_SetSRID(ST_MakePoint(83.0245, 25.3812), 4326),
    'area',
    'Varanasi'
  ),
  (
    'Varanasi Airport (Lal Bahadur Shastri)',
    'वाराणसी हवाई अड्डा',
    ST_SetSRID(ST_MakePoint(82.8593, 25.4524), 4326),
    'airport',
    'Varanasi'
  ),
  (
    'Sigra',
    'सिगरा',
    ST_SetSRID(ST_MakePoint(82.9811, 25.3310), 4326),
    'area',
    'Varanasi'
  ),
  (
    'Ramnagar',
    'रामनगर',
    ST_SetSRID(ST_MakePoint(82.9407, 25.2673), 4326),
    'town',
    'Varanasi'
  ),
  (
    'PDU Junction (Mughal Sarai)',
    'पंडित दीन दयाल उपाध्याय जंक्शन',
    ST_SetSRID(ST_MakePoint(83.1200, 25.2800), 4326),
    'railway_station',
    'Chandauli'
  ),
  (
    'Harhua',
    'हरहुआ',
    ST_SetSRID(ST_MakePoint(82.9500, 25.3700), 4326),
    'area',
    'Varanasi'
  ),
  (
    'Pindra',
    'पिंडरा',
    ST_SetSRID(ST_MakePoint(82.8900, 25.4200), 4326),
    'town',
    'Varanasi'
  ),
  (
    'Chiraigaon',
    'चिरैगाँव',
    ST_SetSRID(ST_MakePoint(83.0500, 25.2900), 4326),
    'town',
    'Varanasi'
  ),
  (
    'Rampur Village Area',
    'रामपुर ग्राम क्षेत्र',
    ST_SetSRID(ST_MakePoint(82.8800, 25.3400), 4326),
    'village',
    'Varanasi'
  )
ON CONFLICT (name) DO NOTHING;
