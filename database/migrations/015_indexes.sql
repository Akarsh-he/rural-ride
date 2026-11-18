-- ============================================================
-- Migration 015: Indexes (Performance)
-- Rural Mobility Super App — Varanasi, India
-- ============================================================
-- All indexes are created with IF NOT EXISTS (idempotent)

-- -------------------------------------------------------
-- users
-- -------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_users_phone       ON users(phone);
CREATE INDEX IF NOT EXISTS idx_users_firebase_uid ON users(firebase_uid) WHERE firebase_uid IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_role_status  ON users(role, status);
CREATE INDEX IF NOT EXISTS idx_users_last_seen    ON users(last_seen_at DESC);

-- -------------------------------------------------------
-- passenger_profiles
-- -------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_passenger_user_id     ON passenger_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_passenger_home_loc    ON passenger_profiles USING GIST(home_location)
  WHERE home_location IS NOT NULL;

-- -------------------------------------------------------
-- driver_profiles
-- -------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_driver_user_id         ON driver_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_driver_is_online        ON driver_profiles(is_online) WHERE is_online = true;
CREATE INDEX IF NOT EXISTS idx_driver_current_location ON driver_profiles USING GIST(current_location)
  WHERE current_location IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_driver_subscription     ON driver_profiles(subscription_plan, subscription_expires_at);

-- -------------------------------------------------------
-- vehicles
-- -------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_vehicles_driver_id    ON vehicles(driver_id);
CREATE INDEX IF NOT EXISTS idx_vehicles_reg_number   ON vehicles(registration_number);
CREATE INDEX IF NOT EXISTS idx_vehicles_type_active  ON vehicles(vehicle_type, is_active);

-- -------------------------------------------------------
-- driver_verifications
-- -------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_dv_driver_id ON driver_verifications(driver_id);
CREATE INDEX IF NOT EXISTS idx_dv_status    ON driver_verifications(status);
CREATE INDEX IF NOT EXISTS idx_dv_expires   ON driver_verifications(expires_at) WHERE expires_at IS NOT NULL;

-- -------------------------------------------------------
-- verification_reminders
-- -------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_vr_driver_id    ON verification_reminders(driver_id);
CREATE INDEX IF NOT EXISTS idx_vr_expires      ON verification_reminders(expires_at);
CREATE INDEX IF NOT EXISTS idx_vr_not_notified ON verification_reminders(expires_at, is_notified)
  WHERE is_notified = false;

-- -------------------------------------------------------
-- journeys
-- -------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_journeys_driver_id          ON journeys(driver_id);
CREATE INDEX IF NOT EXISTS idx_journeys_vehicle_id         ON journeys(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_journeys_status             ON journeys(status);
CREATE INDEX IF NOT EXISTS idx_journeys_departure_time     ON journeys(departure_time);
CREATE INDEX IF NOT EXISTS idx_journeys_status_departure   ON journeys(status, departure_time)
  WHERE status IN ('scheduled', 'active');
CREATE INDEX IF NOT EXISTS idx_journeys_origin_location    ON journeys USING GIST(origin_location);
CREATE INDEX IF NOT EXISTS idx_journeys_dest_location      ON journeys USING GIST(destination_location);
CREATE INDEX IF NOT EXISTS idx_journeys_route_geometry     ON journeys USING GIST(route_geometry)
  WHERE route_geometry IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_journeys_available_seats    ON journeys(available_seats)
  WHERE available_seats > 0;

-- -------------------------------------------------------
-- journey_location_updates
-- -------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_jlu_journey_id    ON journey_location_updates(journey_id);
CREATE INDEX IF NOT EXISTS idx_jlu_recorded_at   ON journey_location_updates(recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_jlu_location      ON journey_location_updates USING GIST(location);

-- -------------------------------------------------------
-- journey_stops
-- -------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_js_journey_id ON journey_stops(journey_id);
CREATE INDEX IF NOT EXISTS idx_js_location   ON journey_stops USING GIST(location);

-- -------------------------------------------------------
-- booking_requests
-- -------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_br_journey_id      ON booking_requests(journey_id);
CREATE INDEX IF NOT EXISTS idx_br_passenger_id    ON booking_requests(passenger_id);
CREATE INDEX IF NOT EXISTS idx_br_status          ON booking_requests(status);
CREATE INDEX IF NOT EXISTS idx_br_pending_expires ON booking_requests(expires_at)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_br_pickup_loc      ON booking_requests USING GIST(pickup_location);
CREATE INDEX IF NOT EXISTS idx_br_dropoff_loc     ON booking_requests USING GIST(dropoff_location);

-- -------------------------------------------------------
-- confirmed_bookings
-- -------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_cb_request_id    ON confirmed_bookings(request_id);
CREATE INDEX IF NOT EXISTS idx_cb_journey_id    ON confirmed_bookings(journey_id);
CREATE INDEX IF NOT EXISTS idx_cb_passenger_id  ON confirmed_bookings(passenger_id);
CREATE INDEX IF NOT EXISTS idx_cb_driver_id     ON confirmed_bookings(driver_id);
CREATE INDEX IF NOT EXISTS idx_cb_status        ON confirmed_bookings(status);
CREATE INDEX IF NOT EXISTS idx_cb_payment_status ON confirmed_bookings(payment_status);
CREATE INDEX IF NOT EXISTS idx_cb_created_at    ON confirmed_bookings(created_at DESC);

-- -------------------------------------------------------
-- payment_transactions
-- -------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_pt_booking_id   ON payment_transactions(booking_id);
CREATE INDEX IF NOT EXISTS idx_pt_payer_id     ON payment_transactions(payer_id);
CREATE INDEX IF NOT EXISTS idx_pt_driver_id    ON payment_transactions(payee_driver_id);
CREATE INDEX IF NOT EXISTS idx_pt_status       ON payment_transactions(status);
CREATE INDEX IF NOT EXISTS idx_pt_gateway_txn  ON payment_transactions(gateway_transaction_id)
  WHERE gateway_transaction_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pt_created_at   ON payment_transactions(created_at DESC);

-- -------------------------------------------------------
-- driver_earnings
-- -------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_de_driver_id    ON driver_earnings(driver_id);
CREATE INDEX IF NOT EXISTS idx_de_booking_id   ON driver_earnings(booking_id);
CREATE INDEX IF NOT EXISTS idx_de_earned_date  ON driver_earnings(driver_id, earned_at DESC);

-- -------------------------------------------------------
-- driver_expenses
-- -------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_dexp_driver_id    ON driver_expenses(driver_id);
CREATE INDEX IF NOT EXISTS idx_dexp_expense_date ON driver_expenses(driver_id, expense_date DESC);

-- -------------------------------------------------------
-- reviews
-- -------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_reviews_booking_id  ON reviews(booking_id);
CREATE INDEX IF NOT EXISTS idx_reviews_reviewer    ON reviews(reviewer_id);
CREATE INDEX IF NOT EXISTS idx_reviews_reviewee    ON reviews(reviewee_id);
CREATE INDEX IF NOT EXISTS idx_reviews_visible     ON reviews(reviewee_id, is_visible)
  WHERE is_visible = true;

-- -------------------------------------------------------
-- notifications
-- -------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_notif_user_id    ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notif_unread     ON notifications(user_id, is_read, created_at DESC)
  WHERE is_read = false;
CREATE INDEX IF NOT EXISTS idx_notif_created_at ON notifications(created_at DESC);

-- -------------------------------------------------------
-- device_tokens
-- -------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_dt_user_id   ON device_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_dt_active    ON device_tokens(user_id, platform, is_active)
  WHERE is_active = true;

-- -------------------------------------------------------
-- advertisements
-- -------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_ads_status      ON advertisements(status);
CREATE INDEX IF NOT EXISTS idx_ads_target_area ON advertisements USING GIST(target_area)
  WHERE target_area IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ads_active_dates ON advertisements(starts_at, ends_at)
  WHERE status = 'active';

-- -------------------------------------------------------
-- support_tickets
-- -------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_st_user_id      ON support_tickets(user_id);
CREATE INDEX IF NOT EXISTS idx_st_booking_id   ON support_tickets(booking_id);
CREATE INDEX IF NOT EXISTS idx_st_status       ON support_tickets(status);
CREATE INDEX IF NOT EXISTS idx_st_assigned_to  ON support_tickets(assigned_to) WHERE assigned_to IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_st_priority     ON support_tickets(priority, status);

-- -------------------------------------------------------
-- support_messages
-- -------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_sm_ticket_id  ON support_messages(ticket_id);
CREATE INDEX IF NOT EXISTS idx_sm_sender_id  ON support_messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_sm_created_at ON support_messages(ticket_id, created_at ASC);

-- -------------------------------------------------------
-- Full-text search indexes (pg_trgm)
-- -------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_trgm_journeys_origin ON journeys USING GIN(origin_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_trgm_journeys_dest   ON journeys USING GIN(destination_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_trgm_pass_name       ON passenger_profiles USING GIN(full_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_trgm_driver_name     ON driver_profiles USING GIN(full_name gin_trgm_ops);
