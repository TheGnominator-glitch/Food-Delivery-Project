import { DELIVERY_BASE_FEE, DELIVERY_FEE_PER_KM, MINUTES_PER_KM, PREP_MINUTES } from "./constants";

// A point on the map
export interface Point {
  lat: number;
  lng: number;
}

// FR28: a restaurant the driver picks up from
export interface Stop extends Point {
  id: number;
  name: string;
}

// FR18, FR28: the pickups in visiting order, the distance, and what it costs and takes
export interface DeliveryPlan {
  pickups: Stop[];
  distanceKm: number;
  deliveryCost: number;
  estimateMinutes: number;
}

const EARTH_RADIUS_KM = 6371;

// FR28: a valid latitude or longitude
export const isLatitude = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= 90;
export const isLongitude = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= 180;

// Oracle stores coordinates with 6 decimals, so every calculation uses the same precision
export const toStoredPrecision = (p: Point): Point => ({
  lat: Math.round(p.lat * 1e6) / 1e6,
  lng: Math.round(p.lng * 1e6) / 1e6,
});

// Straight-line distance in km via the haversine formula (the same formula Oracle uses for FR9)
export function haversineKm(a: Point, b: Point): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

// FR18, FR28: one driver visits every restaurant, farthest from the customer first, then delivers.
// The cost and estimate use straight lines, so checkout never depends on OSRM (NFR6).
export function planDelivery(restaurants: Stop[], destination: Point): DeliveryPlan {
  const pickups = [...restaurants].sort((a, b) => haversineKm(b, destination) - haversineKm(a, destination));
  let km = 0;
  for (let i = 0; i < pickups.length; i++) {
    const next = i + 1 < pickups.length ? pickups[i + 1] : destination;
    km += haversineKm(pickups[i], next);
  }
  // Rounded to metres first, so floating-point noise cannot push a whole km up by one
  const distanceKm = Math.round(km * 1000) / 1000;
  return {
    pickups,
    distanceKm,
    deliveryCost: DELIVERY_BASE_FEE + Math.ceil(distanceKm) * DELIVERY_FEE_PER_KM,
    estimateMinutes: Math.ceil(PREP_MINUTES + distanceKm * MINUTES_PER_KM),
  };
}
