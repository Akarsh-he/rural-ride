import Joi from 'joi';

// ── Common ───────────────────────────────────────────────────────────────────

export const uuidSchema = Joi.string().uuid({ version: 'uuidv4' });

export const coordinatesSchema = Joi.object({
  lat: Joi.number().min(-90).max(90).required(),
  lng: Joi.number().min(-180).max(180).required(),
});

export const paginationSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
});

export const phoneSchema = Joi.string()
  .pattern(/^\+?[1-9]\d{9,14}$/)
  .messages({ 'string.pattern.base': 'Invalid phone number format' });

// ── Auth ─────────────────────────────────────────────────────────────────────

export const verifyTokenSchema = Joi.object({
  idToken: Joi.string().required(),
  role: Joi.string().valid('passenger', 'driver').required(),
  phone: phoneSchema.required(),
  language: Joi.string().valid('hi', 'en').default('hi'),
});

// ── Journeys ─────────────────────────────────────────────────────────────────

export const createJourneySchema = Joi.object({
  vehicleId: Joi.string().uuid().required(),
  originName: Joi.string().min(2).max(200).required(),
  originLat: Joi.number().min(-90).max(90).required(),
  originLng: Joi.number().min(-180).max(180).required(),
  destinationName: Joi.string().min(2).max(200).required(),
  destinationLat: Joi.number().min(-90).max(90).required(),
  destinationLng: Joi.number().min(-180).max(180).required(),
  routeGeometry: Joi.string().required(), // road GeoJSON LineString as string
  waypoints: Joi.array().items(Joi.object()).optional(),
  totalDistanceKm: Joi.number().min(0).optional(),
  departureTime: Joi.string().isoDate().required(),
  estimatedArrivalTime: Joi.string().isoDate().optional(),
  totalSeats: Joi.number().integer().min(1).max(10),
  maxSeats: Joi.number().integer().min(1).max(10),
  baseFarePerKm: Joi.number().min(0).optional(),
  minimumFare: Joi.number().min(0).optional(),
  journeyType: Joi.string().valid('shared', 'private').default('shared'),
  notes: Joi.string().max(500).optional(),
}).or('totalSeats', 'maxSeats');

export const locationUpdateSchema = Joi.object({
  lat: Joi.number().min(-90).max(90).required(),
  lng: Joi.number().min(-180).max(180).required(),
  heading: Joi.number().min(0).max(360).optional(),
  speed: Joi.number().min(0).optional(),
});

export const journeySearchSchema = Joi.object({
  pickupLat: Joi.number().min(-90).max(90).required(),
  pickupLng: Joi.number().min(-180).max(180).required(),
  destinationLat: Joi.number().min(-90).max(90).required(),
  destinationLng: Joi.number().min(-180).max(180).required(),
  seatsNeeded: Joi.number().integer().min(1).max(6).default(1),
  maxDeviationMeters: Joi.number().min(100).max(2000).optional(),
  vehicleTypes: Joi.array()
    .items(Joi.string().valid('auto_rickshaw', 'e_rickshaw', 'bike', 'private_car', 'tempo'))
    .optional(),
  maxResults: Joi.number().integer().min(1).max(50).default(20),
});

// ── Bookings ─────────────────────────────────────────────────────────────────

export const bookingRequestSchema = Joi.object({
  journeyId: Joi.string().uuid().required(),
  seatsRequested: Joi.number().integer().min(1).max(6).default(1),
  pickupName: Joi.string().min(2).max(200).required(),
  pickupLat: Joi.number().min(-90).max(90).required(),
  pickupLng: Joi.number().min(-180).max(180).required(),
  dropoffName: Joi.string().min(2).max(200).required(),
  dropoffLat: Joi.number().min(-90).max(90).required(),
  dropoffLng: Joi.number().min(-180).max(180).required(),
  paymentMethod: Joi.string().valid('cash', 'upi', 'card', 'wallet').default('cash'),
  notes: Joi.string().max(300).optional(),
});

// ── Users / Profiles ─────────────────────────────────────────────────────────

export const updateUserSchema = Joi.object({
  fullName: Joi.string().min(2).max(100).optional(),
  email: Joi.string().email().optional(),
  profilePhotoUrl: Joi.string().uri().optional(),
  preferredLanguage: Joi.string().valid('hi', 'en').optional(),
  homeLat: Joi.number().min(-90).max(90).optional(),
  homeLng: Joi.number().min(-180).max(180).optional(),
  homeAddress: Joi.string().max(300).optional(),
  emergencyContacts: Joi.array()
    .items(
      Joi.object({
        name: Joi.string().required(),
        phone: phoneSchema.required(),
      })
    )
    .max(3)
    .optional(),
});

// ── Payments ─────────────────────────────────────────────────────────────────

export const createPaymentOrderSchema = Joi.object({
  bookingId: Joi.string().uuid().required(),
  amount: Joi.number().min(1).required(),
});

export const verifyPaymentSchema = Joi.object({
  razorpayOrderId: Joi.string().required(),
  razorpayPaymentId: Joi.string().required(),
  razorpaySignature: Joi.string().required(),
  bookingId: Joi.string().uuid().required(),
});

export const cashPaymentSchema = Joi.object({
  bookingId: Joi.string().uuid().required(),
});

// ── Financials ───────────────────────────────────────────────────────────────

export const addExpenseSchema = Joi.object({
  amount: Joi.number().min(0.01).required(),
  category: Joi.string()
    .valid('fuel', 'maintenance', 'insurance', 'permit', 'other')
    .required(),
  description: Joi.string().max(300).optional(),
  expenseDate: Joi.string().isoDate().default(() => new Date().toISOString().split('T')[0]),
});

export const earningsQuerySchema = Joi.object({
  period: Joi.string().valid('daily', 'weekly', 'monthly').default('weekly'),
  startDate: Joi.string().isoDate().optional(),
  endDate: Joi.string().isoDate().optional(),
});

// ── Support ──────────────────────────────────────────────────────────────────

export const createTicketSchema = Joi.object({
  subject: Joi.string().min(5).max(200).required(),
  description: Joi.string().min(10).max(2000).required(),
  category: Joi.string()
    .valid('payment', 'driver', 'passenger', 'app', 'safety', 'other')
    .default('other'),
  relatedBookingId: Joi.string().uuid().optional(),
});

export const addTicketMessageSchema = Joi.object({
  message: Joi.string().min(1).max(2000).required(),
  attachmentUrl: Joi.string().uri().optional(),
});

// ── Subscriptions ─────────────────────────────────────────────────────────────

export const subscribeSchema = Joi.object({
  plan: Joi.string().valid('free', 'pro', 'premium').required(),
  paymentOrderId: Joi.string().optional(),
});

// ── Vehicles ─────────────────────────────────────────────────────────────────

export const addVehicleSchema = Joi.object({
  vehicleType: Joi.string()
    .valid('auto_rickshaw', 'e_rickshaw', 'bike', 'private_car', 'tempo')
    .required(),
  registrationNumber: Joi.string()
    .pattern(/^[A-Z]{2}\d{2}[A-Z]{2}\d{4}$|^[A-Z]{2}\d{2}[A-Z]{1,2}\d{4}$/)
    .uppercase()
    .required(),
  make: Joi.string().max(50).optional(),
  model: Joi.string().max(50).optional(),
  year: Joi.number().integer().min(2000).max(new Date().getFullYear() + 1).optional(),
  color: Joi.string().max(30).optional(),
  maxPassengers: Joi.number().integer().min(1).max(10).required(),
  fuelType: Joi.string().valid('petrol', 'diesel', 'cng', 'electric', 'hybrid').optional(),
  photoUrls: Joi.array().items(Joi.string().uri()).max(5).optional(),
});

/**
 * Validate a request body against a Joi schema.
 * Returns { value, error } — same as schema.validate().
 */
export function validate<T>(
  schema: Joi.ObjectSchema<T>,
  data: unknown
): Joi.ValidationResult<T> {
  return schema.validate(data, {
    abortEarly: false,
    stripUnknown: true,
    convert: true,
  });
}
