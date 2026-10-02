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
  warehouseId: string;
  cost: number;
  trackInventory: boolean;
  createdAt: string;
  updatedAt: string;
};

export type WarehouseHours = { alwaysOpen: boolean; days: string[]; open: string; close: string };

export type Warehouse = {
  id: string;
  name: string;
  code: string;
  contactName: string;
  phone: string;
  email: string;
  streetAddress: string;
  city: string;
  country: string;
  latitude: number | null;
  longitude: number | null;
  hours: WarehouseHours;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type InventoryItem = {
  productId: string;
  name: string;
  sku: string;
  category: string;
  status: string;
  price: number;
  image: string;
  warehouseId: string;
  warehouseName: string;
  quantity: number;
  reserved: number;
  inTransit: number;
  reorderLevel: number;
  low: boolean;
  value: number;
  cost: number;
  costValue: number;
  marginValue: number;
  marginPct: number;
};

export type Vendor = {
  id: string;
  name: string;
  contactName: string;
  phone: string;
  email: string;
  address: string;
  notes: string;
  active: boolean;
  owed: number;
  purchaseCount: number;
  createdAt: string;
  updatedAt: string;
};

export type PurchaseItem = { id: string; productId: string; name: string; quantity: number; unitCost: number; lineTotal: number };

export type Purchase = {
  id: string;
  vendorId: string;
  vendorName: string;
  reference: string;
  status: string;
  paymentStatus: string;
  subtotal: number;
  total: number;
  amountPaid: number;
  notes: string;
  receivedAt: string | null;
  sentAt: string | null;
  createdAt: string;
  updatedAt: string;
  items: PurchaseItem[];
};

export type Accounting = {
  currency: string;
  sales: { total: number; paid: number; outstanding: number; orders: number };
  purchases: { total: number; paid: number; owed: number; count: number };
  cogs: number;
  grossProfit: number;
  grossMarginPct: number;
  inventory: { units: number; costValue: number; retailValue: number; itemCount: number };
  balance: { cash: number; receivables: number; inventoryCost: number; totalAssets: number; payables: number; equity: number };
  receivablesOrders: { id: string; customer: string; total: number; paymentStatus: string }[];
  payablesVendors: { id: string; name: string; owed: number }[];
  salesOrders: { id: string; customer: string; total: number; status: string; paymentStatus: string; createdAt: string }[];
  cogsItems: { name: string; quantity: number; unitCost: number; total: number }[];
  purchaseList: { id: string; vendor: string; total: number; amountPaid: number; status: string; paymentStatus: string; createdAt: string }[];
  purchasePayments: { id: string; vendor: string; amount: number; gateway: string; reference: string; createdAt: string }[];
};

export type StockMovement = { id: string; type: string; quantity: number; reference: string; createdAt: string };

export type ProductHistory = {
  productId: string;
  name: string;
  onHand: number;
  reserved: number;
  inTransit: number;
  reorderLevel: number;
  unitsSold: number;
  revenue: number;
  orderCount: number;
  daily: { date: string; units: number; revenue: number }[];
  movements: StockMovement[];
  forecast: { avgDailyUnits: number; daysOfCover: number | null; suggestedReorder: number; trend: "rising" | "steady" | "falling" };
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

export type Customer = {
  id: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  verified: boolean;
};

export type Account = {
  id: string;
  role: "admin" | "customer";
  isAdmin: boolean;
  name: string;
  email: string;
  phone: string;
  birthday: string;
  gender: string;
  storeId?: string;
  storeName?: string;
};

export type CrmCustomer = {
  id: string;
  name: string;
  email: string;
  phone: string;
  gender: string;
  birthday: string;
  age: number | null;
  verified: boolean;
  createdAt: string;
  lastLoginAt: string | null;
  orders: number;
  spent: number;
  lastOrderAt: string | null;
};

export type StoreSettings = {
  paymentTiming: "prepay" | "cod";
  defaultPaymentGateway: string;
  payments: Record<string, Record<string, unknown>>;
  delivery: { provider: string; markup: number; boostCarrier: { baseUrl: string; customerId: string } };
  pickup: DeliveryAddress & { latitude: number; longitude: number };
  demoDropoff: Coords;
  otp: { webhookUrl: string };
  purchases: { webhookUrl: string };
  terms: string;
  accounting: AccountingOptions;
};

export type AccountingOptions = {
  includeCash: boolean;
  includeReceivables: boolean;
  includeInventory: boolean;
  inventoryBasis: "cost" | "retail";
  includePayables: boolean;
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
