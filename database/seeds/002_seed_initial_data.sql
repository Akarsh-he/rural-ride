-- ============================================================
-- Seed 002: Initial Admin & Platform Configuration
-- Rural Mobility Super App — Varanasi, India
-- ============================================================

-- Master Admin Account (password: RuralAdmin@2026)
INSERT INTO admin_accounts (email, password_hash, name, role, is_active)
VALUES (
  'admin@ruralmobility.in',
  '$2b$10$LwtPkDHhfyUfy21NAaY61ez5vyppwMBiRiMGbwVvaMPJ2g2yLNSDO',
  'Master Administrator',
  'super_admin',
  true
)
ON CONFLICT (email) DO UPDATE
  SET password_hash = EXCLUDED.password_hash,
      is_active = true,
      updated_at = NOW();

-- System Configuration
INSERT INTO platform_settings (key, value, description)
VALUES
(
  'general_config',
  '{
    "platformCommissionPercent": 10,
    "bookingTimeoutMinutes": 2,
    "maxDeviationMeters": 500,
    "sosAlertRadius": 2000,
    "minDriverRating": 3.0,
    "maxPassengersPerJourney": 6,
    "supportPhone": "+91-542-2501234",
    "supportEmail": "support@ruralmobility.in",
    "autoApproveDrivers": false,
    "fareRates": {
      "auto_rickshaw": 12,
      "e_rickshaw": 8,
      "tempo": 10,
      "bus": 5,
      "shared_cab": 15
    }
  }'::jsonb,
  'Master system settings for fares, commission, routing deviations, and support'
)
ON CONFLICT (key) DO UPDATE
  SET value = EXCLUDED.value,
      updated_at = NOW();
