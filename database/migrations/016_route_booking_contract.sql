-- Align booking storage with the route discovery and seat request API.
-- Safe to apply to databases that already ran migrations 001–015.

ALTER TABLE booking_requests
  ADD COLUMN IF NOT EXISTS payment_method payment_method NOT NULL DEFAULT 'cash';

ALTER TABLE confirmed_bookings
  ADD COLUMN IF NOT EXISTS pickup_location GEOMETRY(Point, 4326),
  ADD COLUMN IF NOT EXISTS dropoff_location GEOMETRY(Point, 4326);

UPDATE confirmed_bookings cb
SET pickup_location = br.pickup_location,
    dropoff_location = br.dropoff_location
FROM booking_requests br
WHERE br.id = cb.request_id
  AND (cb.pickup_location IS NULL OR cb.dropoff_location IS NULL);

CREATE UNIQUE INDEX IF NOT EXISTS idx_driver_earnings_booking_unique
  ON driver_earnings(booking_id)
  WHERE booking_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_booking_requests_payment_method
  ON booking_requests(payment_method);
