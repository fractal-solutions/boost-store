export type Product = {
  id: string;
  name: string;
  slug: string;
  description: string;
  price: number;
  compareAtPrice: number | null;
  category: string;
  image: string;
  tags: string[];
  stock: number;
  status: string;
  featured: boolean;
  rating: number;
  createdAt: string;
  updatedAt: string;
};

export type Coords = { latitude: number; longitude: number };

export type DeliveryAddress = { street_address: string[]; city: string; country: string };

export type Order = {
  id: string;
  status: string;
  paymentTiming: "prepay" | "cod";
  subtotal: number;
  deliveryFee: number;
  total: number;
  currency: string;
  paymentStatus: string;
  paymentGateway: string;
  paymentReference: string;
  paymentTransactionId: string;
  delivery: {
    provider: string;
    quoteId: string;
    deliveryId: string;
    status: string;
    trackingUrl: string;
    etaMinutes: number;
    progressPercent: number;
    pickup: DeliveryAddress;
    dropoff: DeliveryAddress;
    pickupCoords: Coords | null;
    dropoffCoords: Coords | null;
    courier: (Coords & { name: string; phone: string; updatedAt: string | null }) | null;
    path: (Coords & { status: string; at: string })[];
  };
  customer: { id: string; name: string; email: string; phone: string; address: string } | null;
  items: { id: string; productId: string; name: string; price: number; quantity: number; image: string; lineTotal: number }[];
  events: { id: string; status: string; message: string; location: string; createdAt: string }[];
  confirmedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type MashupItem = { product: Product; score: number; reason: string };
export type Mashup = { theme: string; title: string; subtitle: string; seed: string; items: MashupItem[] };

export type StoreSettings = {
  paymentTiming: "prepay" | "cod";
  defaultPaymentGateway: string;
  payments: Record<string, Record<string, unknown>>;
  delivery: { provider: string; markup: number; boostCarrier: { baseUrl: string; customerId: string } };
  pickup: DeliveryAddress & { latitude: number; longitude: number };
  demoDropoff: Coords;
};

export type StoreSummary = {
  id: string;
  name: string;
  slug: string;
  description: string;
  currency: string;
  contactEmail: string;
  announcement: string;
  theme: Record<string, string | number>;
  settings: StoreSettings;
};

export type GatewayView = {
  key: string;
  label: string;
  description: string;
  credentialFields: { key: string; label: string; type: "text" | "password"; required: boolean; placeholder?: string }[];
  requiresCredentials: boolean;
  supportsPlaceholder: boolean;
  enabled: boolean;
  configured: boolean;
  config: Record<string, unknown>;
};

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  storeId: string;
  storeSlug: string;
  storeName: string;
};

type Envelope<T> = { success: boolean; data: T; message?: string; error?: { code: string; message: string } };

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers ?? {}) },
  });
  const body = (await response.json().catch(() => null)) as Envelope<T> | null;
  if (!response.ok || !body?.success) {
    throw new Error(body?.error?.message ?? `Request failed (${response.status})`);
  }
  return body.data;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: "PATCH", body: body === undefined ? undefined : JSON.stringify(body) }),
  put: <T>(path: string, body?: unknown) => request<T>(path, { method: "PUT", body: body === undefined ? undefined : JSON.stringify(body) }),
  del: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};

export function placeholderImage(seed: string, size = 600): string {
  return `/api/placeholder/${encodeURIComponent(seed || "boost")}?size=${size}`;
}
