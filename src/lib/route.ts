import type { Coords } from "./api";

export type LngLat = [number, number];

const EARTH_RADIUS_M = 6_371_000;

function toRadians(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** Great-circle distance in metres between two [lng, lat] points. */
export function haversine(a: LngLat, b: LngLat): number {
  const dLat = toRadians(b[1] - a[1]);
  const dLng = toRadians(b[0] - a[0]);
  const lat1 = toRadians(a[1]);
  const lat2 = toRadians(b[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function geometryLength(geometry: LngLat[]): number {
  let total = 0;
  for (let i = 1; i < geometry.length; i++) total += haversine(geometry[i - 1]!, geometry[i]!);
  return total;
}

/** Point that sits at fraction `t` (0..1) of the polyline's length. */
export function pointAtFraction(geometry: LngLat[], t: number): LngLat | null {
  if (geometry.length === 0) return null;
  if (geometry.length === 1) return geometry[0]!;
  const clamped = Math.max(0, Math.min(1, t));
  const total = geometryLength(geometry);
  if (total === 0) return geometry[0]!;
  const target = total * clamped;
  let walked = 0;
  for (let i = 1; i < geometry.length; i++) {
    const from = geometry[i - 1]!;
    const to = geometry[i]!;
    const segment = haversine(from, to);
    if (walked + segment >= target) {
      const ratio = segment === 0 ? 0 : (target - walked) / segment;
      return [from[0] + (to[0] - from[0]) * ratio, from[1] + (to[1] - from[1]) * ratio];
    }
    walked += segment;
  }
  return geometry[geometry.length - 1]!;
}

/** The sub-polyline from the start up to fraction `t`. */
export function sliceAtFraction(geometry: LngLat[], t: number): LngLat[] {
  if (geometry.length < 2) return geometry.slice();
  const clamped = Math.max(0, Math.min(1, t));
  const total = geometryLength(geometry);
  if (total === 0) return [geometry[0]!];
  const target = total * clamped;
  const out: LngLat[] = [geometry[0]!];
  let walked = 0;
  for (let i = 1; i < geometry.length; i++) {
    const from = geometry[i - 1]!;
    const to = geometry[i]!;
    const segment = haversine(from, to);
    if (walked + segment >= target) {
      const ratio = segment === 0 ? 0 : (target - walked) / segment;
      out.push([from[0] + (to[0] - from[0]) * ratio, from[1] + (to[1] - from[1]) * ratio]);
      return out;
    }
    out.push(to);
    walked += segment;
  }
  return out;
}

/** Fraction (0..1) of the closest point on the polyline to `point`. */
export function projectFraction(point: Coords, geometry: LngLat[]): number {
  if (geometry.length < 2) return 0;
  const total = geometryLength(geometry);
  if (total === 0) return 0;
  const p: LngLat = [point.longitude, point.latitude];
  let best = Infinity;
  let bestWalked = 0;
  let walked = 0;
  for (let i = 1; i < geometry.length; i++) {
    const a = geometry[i - 1]!;
    const b = geometry[i]!;
    const segment = haversine(a, b);
    // Sample the segment for the closest point (cheap and accurate enough).
    const steps = 12;
    for (let s = 0; s <= steps; s++) {
      const r = s / steps;
      const sample: LngLat = [a[0] + (b[0] - a[0]) * r, a[1] + (b[1] - a[1]) * r];
      const d = haversine(p, sample);
      if (d < best) {
        best = d;
        bestWalked = walked + segment * r;
      }
    }
    walked += segment;
  }
  return Math.max(0, Math.min(1, bestWalked / total));
}

/** Minimum distance (metres) from a point to the polyline. */
export function distanceToGeometry(point: Coords, geometry: LngLat[]): number {
  if (geometry.length === 0) return Infinity;
  const p: LngLat = [point.longitude, point.latitude];
  if (geometry.length === 1) return haversine(p, geometry[0]!);
  let best = Infinity;
  for (let i = 1; i < geometry.length; i++) {
    const a = geometry[i - 1]!;
    const b = geometry[i]!;
    const steps = 8;
    for (let s = 0; s <= steps; s++) {
      const r = s / steps;
      const sample: LngLat = [a[0] + (b[0] - a[0]) * r, a[1] + (b[1] - a[1]) * r];
      best = Math.min(best, haversine(p, sample));
    }
  }
  return best;
}

/** How far along the route a given order status implies the courier is. */
export function statusFraction(status: string): number {
  switch (status) {
    case "pending":
    case "processing":
    case "ready":
      return 0;
    case "dispatched":
      return 0.08;
    case "in_transit":
      return 0.42;
    case "out_for_delivery":
      return 0.8;
    case "delivered":
    case "completed":
      return 1;
    default:
      return 0;
  }
}
