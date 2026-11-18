export type VehicleType = 'auto_rickshaw' | 'e_rickshaw' | 'bike' | 'private_car' | 'tempo';
export type JourneyType = 'shared' | 'private';

export interface FareParams {
  distanceKm: number;
  vehicleType: VehicleType;
  journeyType: JourneyType;
  seatsBooked?: number;
}

interface FareRates {
  base: number;
  perKm: number;
  sharedPerKm: number;
}

const BASE_FARES: Record<VehicleType, FareRates> = {
  auto_rickshaw: { base: 15, perKm: 10, sharedPerKm: 7 },
  e_rickshaw:    { base: 10, perKm: 8,  sharedPerKm: 5 },
  bike:          { base: 10, perKm: 9,  sharedPerKm: 7 },
  private_car:   { base: 30, perKm: 15, sharedPerKm: 12 },
  tempo:         { base: 20, perKm: 8,  sharedPerKm: 5 },
};

/**
 * Calculate estimated fare in INR (₹).
 * For shared rides the per-km rate is lower (cost is spread across passengers).
 */
export function calculateFare({ distanceKm, vehicleType, journeyType }: FareParams): number {
  const rates = BASE_FARES[vehicleType];
  if (!rates) return 0;
  const perKm = journeyType === 'shared' ? rates.sharedPerKm : rates.perKm;
  const computed = rates.base + distanceKm * perKm;
  return Math.round(Math.max(rates.base, computed));
}

/**
 * Estimate fare from route fraction range.
 * pickup_fraction and dest_fraction are 0.0–1.0 positions along the driver's route.
 */
export function estimateFareFromFraction(
  totalRouteKm: number,
  pickupFraction: number,
  destFraction: number,
  vehicleType: VehicleType,
  journeyType: JourneyType
): number {
  const rideKm = totalRouteKm * Math.abs(destFraction - pickupFraction);
  return calculateFare({ distanceKm: rideKm, vehicleType, journeyType });
}

/**
 * Calculate platform commission (in INR) from a fare amount.
 */
export function calculateCommission(fare: number, commissionPct: number): number {
  return Math.round((fare * commissionPct) / 100);
}

/**
 * Estimate ETA in minutes given distance (km) and avg speed (km/h).
 */
export function estimateEtaMinutes(distanceKm: number, avgSpeedKmh = 20): number {
  if (distanceKm <= 0 || avgSpeedKmh <= 0) return 0;
  return Math.round((distanceKm / avgSpeedKmh) * 60);
}

/**
 * Haversine distance between two coordinates in kilometres.
 */
export function haversineKm(
  lat1: number, lng1: number,
  lat2: number, lng2: number
): number {
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}
