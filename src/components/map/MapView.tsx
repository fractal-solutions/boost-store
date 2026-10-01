import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Coords } from "@/lib/api";
import { loadMapConfig } from "@/lib/mapConfig";
import { cn } from "@/lib/utils";

export type LatLng = [number, number]; // [lng, lat]

const GLYPHS = {
  pickup:
    '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16l1 4H3z"/><path d="M3 11v8a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1v-8"/><path d="M9 20v-5h6v5"/></svg>',
  dropoff:
    '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l9-8 9 8"/><path d="M5 9v11h14V9"/><path d="M10 20v-6h4v6"/></svg>',
  courier:
    '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 5h14v11H1z"/><path d="M15 9h4l3 3v4h-7z"/><circle cx="6" cy="18" r="2"/><circle cx="18" cy="18" r="2"/></svg>',
};

function pinIcon(kind: "pickup" | "dropoff" | "courier"): L.DivIcon {
  const html =
    kind === "courier"
      ? `<div class="bs-courier"><span class="bs-courier-pulse"></span><span class="bs-courier-dot">${GLYPHS.courier}</span></div>`
      : `<div class="bs-pin bs-pin-${kind}">${kind === "pickup" ? GLYPHS.pickup : GLYPHS.dropoff}</div>`;
  const size: L.PointTuple = [34, 34];
  const anchor: L.PointTuple = kind === "courier" ? [17, 17] : [17, 34];
  return L.divIcon({ html, className: "bs-marker", iconSize: size, iconAnchor: anchor });
}

function toLatLng([lng, lat]: LatLng): L.LatLngTuple {
  return [lat, lng];
}

export function MapView({
  pickup,
  dropoff,
  courier,
  route,
  courierPath,
  center,
  zoom = 14,
  interactive = true,
  follow = false,
  onPick,
  className,
}: {
  pickup?: Coords | null;
  dropoff?: Coords | null;
  courier?: Coords | null;
  route?: LatLng[] | null;
  courierPath?: LatLng[] | null;
  center?: Coords | null;
  zoom?: number;
  interactive?: boolean;
  follow?: boolean;
  onPick?: (coords: Coords) => void;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const pickRef = useRef(onPick);
  pickRef.current = onPick;

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, {
      zoomControl: interactive,
      attributionControl: true,
      center: center ? [center.latitude, center.longitude] : [0, 0],
      zoom,
      dragging: interactive,
      scrollWheelZoom: interactive,
      doubleClickZoom: interactive,
      boxZoom: interactive,
      keyboard: interactive,
      tap: interactive,
    });
    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    void loadMapConfig().then((config) => {
      if (mapRef.current !== map) return; // unmounted before tiles resolved
      L.tileLayer(config.tileUrl, {
        attribution: config.attribution,
        maxZoom: config.maxZoom,
      }).addTo(map);
    });

    map.on("click", (event: L.LeafletMouseEvent) => {
      pickRef.current?.({ latitude: event.latlng.lat, longitude: event.latlng.lng });
    });

    const resize = () => map.invalidateSize();
    const timer = setTimeout(resize, 120);
    window.addEventListener("resize", resize);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("resize", resize);
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
  }, [center, interactive, zoom]);

  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();

    const bounds = L.latLngBounds([]);
    const extend = (coords: Coords | null | undefined) => {
      if (!coords) return null;
      const latlng: L.LatLngTuple = [coords.latitude, coords.longitude];
      bounds.extend(latlng);
      return latlng;
    };

    if (route && route.length > 1) {
      const points = route.map(toLatLng);
      points.forEach((point) => bounds.extend(point));
      L.polyline(points, { color: "#b45309", weight: 5, opacity: 0.85, lineCap: "round", lineJoin: "round" }).addTo(layer);
      L.polyline(points, { color: "#ffffff", weight: 1.5, opacity: 0.6 }).addTo(layer);
    }

    if (courierPath && courierPath.length > 1) {
      const points = courierPath.map(toLatLng);
      points.forEach((point) => bounds.extend(point));
      L.polyline(points, { color: "#64748b", weight: 4, opacity: 0.9, lineCap: "round", dashArray: "1 8" }).addTo(layer);
    }

    const pickupLatLng = extend(pickup);
    const dropoffLatLng = extend(dropoff);
    const courierLatLng = extend(courier);

    if (pickupLatLng) L.marker(pickupLatLng, { icon: pinIcon("pickup"), title: "Pickup" }).addTo(layer);
    if (dropoffLatLng) L.marker(dropoffLatLng, { icon: pinIcon("dropoff"), title: "Drop-off" }).addTo(layer);
    if (courierLatLng) L.marker(courierLatLng, { icon: pinIcon("courier"), title: "Courier" }).addTo(layer);

    if (follow && courier) {
      map.setView([courier.latitude, courier.longitude], Math.max(map.getZoom(), 15), { animate: true });
    } else if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [48, 48], maxZoom: 16, animate: false });
    }
  }, [pickup, dropoff, courier, route, courierPath, follow]);

  return <div ref={containerRef} className={cn("z-0 h-full w-full", className)} />;
}
