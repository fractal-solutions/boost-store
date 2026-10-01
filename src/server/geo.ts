import { env } from "./env";
import { badRequest } from "./lib";

export type Place = {
  label: string;
  name: string;
  street: string;
  city: string;
  country: string;
  countryCode: string;
  latitude: number;
  longitude: number;
};

export type RouteResult = {
  distanceMeters: number;
  durationSeconds: number;
  geometry: [number, number][]; // [lng, lat]
  bbox: [number, number, number, number]; // minLng, minLat, maxLng, maxLat
};

type PhotonFeature = {
  geometry?: { coordinates?: [number, number] };
  properties?: Record<string, string | undefined>;
};

function toPlace(feature: PhotonFeature): Place | null {
  const coordinates = feature.geometry?.coordinates;
  if (!coordinates || coordinates.length < 2) return null;
  const [longitude, latitude] = coordinates;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  const p = feature.properties ?? {};
  const streetLine = [p.housenumber, p.street].filter(Boolean).join(" ");
  const name = p.name || streetLine || p.city || "Dropped pin";
  const label = [p.name, streetLine, p.city, p.country].filter(Boolean).join(", ") || name;
  return {
    label,
    name,
    street: streetLine,
    city: p.city ?? p.district ?? p.state ?? "",
    country: p.country ?? "",
    countryCode: (p.countrycode ?? "").toUpperCase(),
    latitude,
    longitude,
  };
}

export async function searchPlaces(query: string, limit = 6): Promise<Place[]> {
  if (!query.trim()) return [];
  const url = new URL(env.geocoderUrl);
  url.searchParams.set("q", query);
  url.searchParams.set("limit", String(limit));
  if (env.geocoderBbox) url.searchParams.set("bbox", env.geocoderBbox);
  const response = await fetch(url, {
    headers: { "User-Agent": env.geocoderUserAgent, Accept: "application/json" },
    signal: AbortSignal.timeout(8000),
  }).catch(() => null);
  if (!response || !response.ok) return [];
  const body = (await response.json().catch(() => null)) as { features?: PhotonFeature[] } | null;
  const places = (body?.features ?? []).map(toPlace).filter((place): place is Place => place !== null);
  // Keep results inside the configured country; drop clearly-elsewhere matches.
  return env.geocoderCountry ? places.filter((place) => !place.countryCode || place.countryCode === env.geocoderCountry) : places;
}

export async function reverseGeocode(latitude: number, longitude: number): Promise<Place | null> {
  // Photon's reverse endpoint lives at the host root, not under /api.
  const reverseBase = env.geocoderUrl.replace(/\/api\/?$/, "").replace(/\/+$/, "");
  const url = new URL(`${reverseBase}/reverse`);
  url.searchParams.set("lat", String(latitude));
  url.searchParams.set("lon", String(longitude));
  url.searchParams.set("limit", "1");
  const response = await fetch(url, {
    headers: { "User-Agent": env.geocoderUserAgent, Accept: "application/json" },
    signal: AbortSignal.timeout(8000),
  }).catch(() => null);
  if (!response || !response.ok) return null;
  const body = (await response.json().catch(() => null)) as { features?: PhotonFeature[] } | null;
  const feature = body?.features?.[0];
  if (!feature) return null;
  const place = toPlace(feature);
  if (place) return place;
  const coordinates = feature.geometry?.coordinates;
  return coordinates
    ? { label: "Dropped pin", name: "Dropped pin", street: "", city: "", country: "", countryCode: "", longitude: coordinates[0], latitude: coordinates[1] }
    : null;
}

export async function route(
  from: { latitude: number; longitude: number },
  to: { latitude: number; longitude: number },
): Promise<RouteResult> {
  const coords = `${from.longitude},${from.latitude};${to.longitude},${to.latitude}`;
  const url = `${env.routerUrl}/route/v1/${env.routerProfile}/${coords}?overview=full&geometries=geojson&steps=false`;
  const response = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(10_000) }).catch(() => null);
  if (!response || !response.ok) throw badRequest("ROUTE_UNAVAILABLE", "Routing service is unavailable right now.");
  const body = (await response.json().catch(() => null)) as
    | { code?: string; routes?: { distance: number; duration: number; geometry?: { coordinates?: [number, number][] } }[] }
    | null;
  const best = body?.routes?.[0];
  const geometry = best?.geometry?.coordinates;
  if (!best || !Array.isArray(geometry) || geometry.length === 0) {
    throw badRequest("ROUTE_NOT_FOUND", "No route could be calculated for those locations.");
  }
  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;
  for (const [lng, lat] of geometry) {
    minLng = Math.min(minLng, lng);
    maxLng = Math.max(maxLng, lng);
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
  }
  return {
    distanceMeters: Math.round(best.distance),
    durationSeconds: Math.round(best.duration),
    geometry,
    bbox: [minLng, minLat, maxLng, maxLat],
  };
}

export function mapConfig() {
  const tileUrl = env.cartoApiKey
    ? `${env.mapTileUrl}?key=${encodeURIComponent(env.cartoApiKey)}`
    : env.mapTileUrl;
  return {
    tileUrl,
    attribution: env.mapTileAttribution,
    maxZoom: env.mapMaxZoom,
    center: { latitude: env.mapDefaultLat, longitude: env.mapDefaultLng },
    zoom: env.mapDefaultZoom,
    routing: true,
  };
}
