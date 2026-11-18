// ── Shared / Common ───────────────────────────────────────────────────────────

export type UserRole = 'passenger' | 'driver' | 'admin' | 'support';
export type UserStatus = 'active' | 'suspended' | 'pending' | 'deleted';
export type Language = 'hi' | 'en';
export type VehicleType = 'auto_rickshaw' | 'e_rickshaw' | 'bike' | 'private_car' | 'tempo';
export type JourneyType = 'shared' | 'private';
export type JourneyStatus = 'scheduled' | 'active' | 'completed' | 'cancelled';
export type BookingStatus =
  | 'pending'
  | 'accepted'
  | 'rejected'
  | 'cancelled'
  | 'picked_up'
  | 'completed';
export type PaymentStatus = 'pending' | 'paid' | 'failed' | 'refunded';
export type PaymentMethod = 'cash' | 'upi' | 'card' | 'wallet';
export type SubscriptionPlan = 'free' | 'pro' | 'premium';
export type SupportTicketStatus = 'open' | 'in_progress' | 'resolved' | 'closed';
export type VerificationDocType = 'aadhaar' | 'pan' | 'dl' | 'rc' | 'permit' | 'insurance' | 'fitness';
export type VerificationStatus = 'pending' | 'under_review' | 'approved' | 'rejected';
export type FuelType = 'petrol' | 'diesel' | 'cng' | 'electric' | 'hybrid';

export interface GeoPoint {
  lat: number;
  lng: number;
}

export interface PaginationQuery {
  page: number;
  limit: number;
}

// ── Express Request Augmentation ──────────────────────────────────────────────

export interface AuthUser {
  firebaseUid: string;
  userId: string;
  role: UserRole;
  driverProfileId?: string;
  passengerProfileId?: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

// ── Database Row Types ────────────────────────────────────────────────────────

export interface UserRow {
  id: string;
  phone: string;
  phone_verified: boolean;
  email: string | null;
  firebase_uid: string;
  role: UserRole;
  status: UserStatus;
  preferred_language: Language;
  created_at: Date;
  updated_at: Date;
  last_seen_at: Date | null;
}

export interface DriverProfileRow {
  id: string;
  user_id: string;
  full_name: string;
  profile_photo_url: string | null;
  date_of_birth: Date | null;
  address: string | null;
  vehicle_id: string | null;
  is_verified: boolean;
  is_online: boolean;
  current_location: unknown;
  location_updated_at: Date | null;
  rating: string;
  total_ratings: number;
  subscription_plan: SubscriptionPlan;
  subscription_expires_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface PassengerProfileRow {
  id: string;
  user_id: string;
  full_name: string;
  profile_photo_url: string | null;
  home_location: unknown;
  home_address: string | null;
  emergency_contacts: { name: string; phone: string }[];
  total_rides: number;
  created_at: Date;
  updated_at: Date;
}

export interface VehicleRow {
  id: string;
  driver_id: string;
  vehicle_type: VehicleType;
  registration_number: string;
  make: string | null;
  model: string | null;
  year: number | null;
  color: string | null;
  max_passengers: number;
  fuel_type: FuelType | null;
  photo_urls: string[];
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface JourneyRow {
  id: string;
  driver_id: string;
  vehicle_id: string;
  status: JourneyStatus;
  journey_type: JourneyType;
  origin_name: string;
  origin_location: unknown;
  destination_name: string;
  destination_location: unknown;
  route_geometry: unknown;
  waypoints: unknown[];
  total_distance_km: string;
  departure_time: Date;
  estimated_arrival_time: Date | null;
  actual_start_time: Date | null;
  actual_end_time: Date | null;
  total_seats: number;
  available_seats: number;
  base_fare_per_km: string;
  minimum_fare: string;
  accepts_new_passengers: boolean;
  platform_commission_pct: string;
  notes: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface BookingRequestRow {
  id: string;
  journey_id: string;
  passenger_id: string;
  driver_id: string;
  status: BookingStatus;
  seats_requested: number;
  pickup_name: string;
  pickup_location: unknown;
  dropoff_name: string;
  dropoff_location: unknown;
  fare_estimate: string;
  payment_method: PaymentMethod;
  passenger_notes: string | null;
  expires_at: Date;
  created_at: Date;
  updated_at: Date;
}

export interface ConfirmedBookingRow {
  id: string;
  request_id: string;
  journey_id: string;
  passenger_id: string;
  driver_id: string;
  seats_booked: number;
  confirmed_fare: string;
  pickup_name: string;
  pickup_location: unknown;
  dropoff_name: string;
  dropoff_location: unknown;
  payment_method: PaymentMethod;
  payment_status: PaymentStatus;
  razorpay_order_id: string | null;
  razorpay_payment_id: string | null;
  pickup_time: Date | null;
  dropoff_time: Date | null;
  status: BookingStatus;
  created_at: Date;
  updated_at: Date;
}

export interface PaymentRow {
  id: string;
  booking_id: string;
  passenger_id: string;
  driver_id: string;
  amount: string;
  platform_commission: string;
  driver_earning: string;
  payment_method: PaymentMethod;
  status: PaymentStatus;
  razorpay_order_id: string | null;
  razorpay_payment_id: string | null;
  razorpay_signature: string | null;
  processed_at: Date | null;
  created_at: Date;
}

export interface ExpenseRow {
  id: string;
  driver_id: string;
  amount: string;
  category: string;
  description: string | null;
  expense_date: Date;
  created_at: Date;
}

export interface SupportTicketRow {
  id: string;
  user_id: string;
  subject: string;
  description: string;
  category: string;
  status: SupportTicketStatus;
  related_booking_id: string | null;
  assigned_to: string | null;
  created_at: Date;
  updated_at: Date;
}

// ── Service / API Types ───────────────────────────────────────────────────────

export interface SearchParams {
  pickupLat: number;
  pickupLng: number;
  destinationLat: number;
  destinationLng: number;
  seatsNeeded: number;
  maxDeviationMeters?: number;
  vehicleTypes?: VehicleType[];
  maxResults?: number;
}

export interface MatchedJourney {
  journeyId: string;
  driverName: string;
  driverPhoto: string | null;
  driverRating: number;
  vehicleType: VehicleType;
  registrationNumber: string;
  originName: string;
  destinationName: string;
  waypoints: unknown[];
  availableSeats: number;
  departureTime: string;
  estimatedPickupTime: string | null;
  estimatedDropoffTime: string | null;
  pickupDistanceMeters: number;
  fareEstimate: number;
  compatibilityScore: number;
  driverCurrentLocation?: GeoPoint;
}

export interface DriverDashboard {
  driverId: string;
  driverName: string;
  isOnline: boolean;
  rating: number;
  totalRides: number;
  earnings: {
    today: number;
    thisWeek: number;
    thisMonth: number;
  };
  activeJourney: JourneyRow | null;
  pendingBookings: number;
  subscriptionPlan: SubscriptionPlan;
}

export interface RevenueStats {
  totalRevenue: number;
  platformRevenue: number;
  driverEarnings: number;
  totalRides: number;
  avgFare: number;
  period: string;
}
