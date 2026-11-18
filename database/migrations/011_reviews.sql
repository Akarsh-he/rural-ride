-- ============================================================
-- Migration 011: Reviews
-- Rural Mobility Super App — Varanasi, India
-- ============================================================

-- ENUM types
DO $$ BEGIN
  CREATE TYPE reviewer_role AS ENUM ('passenger', 'driver');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- -------------------------------------------------------
-- Reviews
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS reviews (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id    UUID NOT NULL UNIQUE REFERENCES confirmed_bookings(id) ON DELETE CASCADE,
  reviewer_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reviewee_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reviewer_role reviewer_role NOT NULL,
  rating        INT NOT NULL,
  comment       TEXT,
  is_visible    BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_review_rating   CHECK (rating >= 1 AND rating <= 5),
  CONSTRAINT chk_review_no_self  CHECK (reviewer_id <> reviewee_id)
);

COMMENT ON TABLE reviews IS 'Post-trip ratings; one review per booking (UNIQUE on booking_id); both passenger→driver and driver→passenger allowed via reviewer_role';
COMMENT ON COLUMN reviews.reviewer_role IS 'Who wrote the review: passenger reviewing driver, or driver reviewing passenger';
COMMENT ON COLUMN reviews.is_visible IS 'Set false to hide a review flagged as abusive (soft delete)';

-- -------------------------------------------------------
-- Trigger: Update driver_profiles.rating after each review
-- -------------------------------------------------------
CREATE OR REPLACE FUNCTION update_driver_rating()
RETURNS TRIGGER AS $$
DECLARE
  v_driver_user_id UUID;
BEGIN
  -- Only recompute when the reviewee is a driver
  IF NEW.reviewer_role = 'passenger' THEN
    -- reviewee_id is the driver's user_id
    UPDATE driver_profiles dp
    SET
      rating        = sub.avg_rating,
      total_ratings = sub.total_count,
      updated_at    = NOW()
    FROM (
      SELECT
        AVG(r.rating)::DECIMAL(3,2) AS avg_rating,
        COUNT(*)                    AS total_count
      FROM reviews r
      JOIN confirmed_bookings cb ON cb.id = r.booking_id
      JOIN driver_profiles     dp2 ON dp2.id = cb.driver_id
      JOIN users               u  ON u.id = dp2.user_id
      WHERE u.id = NEW.reviewee_id
        AND r.is_visible = true
    ) sub
    WHERE dp.user_id = NEW.reviewee_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_driver_rating ON reviews;
CREATE TRIGGER trg_update_driver_rating
  AFTER INSERT OR UPDATE ON reviews
  FOR EACH ROW EXECUTE FUNCTION update_driver_rating();
