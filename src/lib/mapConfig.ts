import { api, type Coords } from "./api";

export type MapConfig = { tileUrl: string; attribution: string; maxZoom: number; center: { latitude: number; longitude: number }; zoom: number; routing: boolean };

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
  bbox: [number, number, number, number];
};

const DEFAULT_CONFIG: MapConfig = {
  tileUrl: "https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png",
  attribution: "© OpenStreetMap contributors © CARTO",
  maxZoom: 20,
  center: { latitude: -1.2864, longitude: 36.8172 },
  zoom: 12,
  routing: true,
};

let cached: MapConfig | null = null;

export async function loadMapConfig(): Promise<MapConfig> {
  if (cached) return cached;
  try {
    cached = await api.get<MapConfig>("/api/map-config");
  } catch {
    cached = DEFAULT_CONFIG;
  }
  return cached;
}

export async function searchPlaces(query: string): Promise<Place[]> {
  if (!query.trim()) return [];
  try {
    return await api.get<Place[]>(`/api/geo/search?q=${encodeURIComponent(query)}`);
  } catch {
    return [];
  }
}

export async function reverseGeocode(coords: Coords): Promise<Place | null> {
  try {
    return await api.get<Place>(`/api/geo/reverse?lat=${coords.latitude}&lng=${coords.longitude}`);
  } catch {
    return null;
  }
}

export async function fetchRoute(from: Coords, to: Coords): Promise<RouteResult | null> {
  try {
    return await api.get<RouteResult>(`/api/geo/route?from=${from.latitude},${from.longitude}&to=${to.latitude},${to.longitude}`);
  } catch {
    return null;
  }
}

export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

export function formatDuration(seconds: number): string {
  const minutes = Math.max(1, Math.round(seconds / 60));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}
