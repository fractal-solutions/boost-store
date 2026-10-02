import path from "node:path";

const dataDir = process.env.BOOST_STORE_DATA_DIR || path.join(process.cwd(), "data");

function bool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  return /^(1|true|yes|on)$/i.test(value);
}

export const env = {
  port: Number(process.env.PORT || process.env.BUN_PORT || 4000),
  dataDir,
  dbFile: process.env.BOOST_STORE_DB || path.join(dataDir, "boost-store.db"),
  publicBaseUrl: process.env.APP_BASE_URL || "http://localhost:4000",

  // Delivery: boost-carrier is the default; `simulated` works with no services.
  deliveryProvider: process.env.DELIVERY_PROVIDER || "boost-carrier",
  boostCarrierUrl: (process.env.BOOST_CARRIER_URL || "http://localhost:5000").replace(/\/+$/, ""),
  boostCarrierCustomerId: process.env.BOOST_CARRIER_CUSTOMER_ID || "PENDING_MERCHANT_ID_PLACEHOLDER",
  // Shared secret used to verify inbound webhooks forwarded by boost-carrier.
  deliveryWebhookSecret: process.env.DELIVERY_WEBHOOK_SECRET || "",

  // Customer onboarding OTP webhook (e.g. an n8n workflow that sends the code
  // to email and WhatsApp). When empty, the code is shown to the user instead.
  otpWebhookUrl: process.env.OTP_WEBHOOK_URL || "",

  // Purchase-order webhook (e.g. an n8n workflow) that emails/sends the PO to the vendor.
  purchaseWebhookUrl: process.env.PURCHASE_WEBHOOK_URL || "",

  // Order-notification webhook (e.g. n8n) that emails/SMSes customers on order events.
  notifyWebhookUrl: process.env.NOTIFY_WEBHOOK_URL || "",

  // Admin (merchant) accounts are provisioned by the operator. Public signup of
  // new admin/merchant accounts is disabled unless explicitly enabled.
  allowMerchantSignup: /^(1|true|yes|on)$/i.test(process.env.ALLOW_MERCHANT_SIGNUP || ""),

  // Payments: mock is always available; M-PESA (Daraja) is opt-in and can run
  // in placeholder mode without real credentials.
  mpesaEnabled: bool(process.env.MPESA_ENABLED, false),
  mpesaEnvironment: process.env.MPESA_ENV || "sandbox",
  mpesaConsumerKey: process.env.MPESA_CONSUMER_KEY || "",
  mpesaConsumerSecret: process.env.MPESA_CONSUMER_SECRET || "",
  mpesaPasskey: process.env.MPESA_PASSKEY || "",
  mpesaShortcode: process.env.MPESA_SHORTCODE || "",
  mpesaCallbackUrl: process.env.MPESA_CALLBACK_URL || "",

  defaultPaymentTiming: (process.env.PAYMENT_TIMING_DEFAULT as "prepay" | "cod") || "prepay",

  // Demo pickup/drop-off coordinates used for the delivery map when the store
  // is first seeded. Point these at your provider's courier area for a
  // coherent local demo (the bundled mock reports a fixed courier location).
  demoPickupLat: Number(process.env.DEMO_PICKUP_LAT ?? "-1.2864"),
  demoPickupLng: Number(process.env.DEMO_PICKUP_LNG ?? "36.8172"),
  demoDropoffLat: Number(process.env.DEMO_DROPOFF_LAT ?? "-1.2921"),
  demoDropoffLng: Number(process.env.DEMO_DROPOFF_LNG ?? "36.8219"),

  // Geocoding (address search / reverse) and routing. Defaults are public,
  // key-less services; swap in your own provider via these env vars.
  geocoderUrl: (process.env.GEOCODER_URL || "https://photon.komoot.io/api/").replace(/\/+$/, ""),
  geocoderUserAgent: process.env.GEOCODER_USER_AGENT || "boost-store/1.0",
  // Restrict address search to a country (ISO 3166-1 alpha-2) and optional
  // bbox (minLon,minLat,maxLon,maxLat). Defaults to Kenya.
  geocoderCountry: (process.env.GEOCODER_COUNTRY || "KE").toUpperCase(),
  geocoderBbox: process.env.GEOCODER_BBOX || "33.89,-4.68,41.86,5.03",
  routerUrl: (process.env.ROUTER_URL || "https://router.project-osrm.org").replace(/\/+$/, ""),
  routerProfile: process.env.ROUTER_PROFILE || "driving",

  // Map tiles served to the browser via /api/map-config.
  mapTileUrl: process.env.MAP_TILE_URL || "https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png",
  mapTileAttribution: process.env.MAP_TILE_ATTRIBUTION || '&copy; OpenStreetMap contributors &copy; CARTO',
  mapMaxZoom: Number(process.env.MAP_MAX_ZOOM || 20),
  mapDefaultLat: Number(process.env.MAP_DEFAULT_LAT ?? "-1.2864"),
  mapDefaultLng: Number(process.env.MAP_DEFAULT_LNG ?? "36.8172"),
  mapDefaultZoom: Number(process.env.MAP_DEFAULT_ZOOM ?? 12),
  // Product imagery. Defaults to Lorem Picsum (real photos, deterministic per
  // seed, no key). Swap PRODUCT_IMAGE_URL for your own provider/template.
  productImageEnabled: !/^(0|false|no|off)$/i.test(process.env.PRODUCT_IMAGE_ENABLED || "true"),
  productImageUrl: process.env.PRODUCT_IMAGE_URL || "https://picsum.photos/seed/{seed}/{w}/{h}",
  // CARTO Basemaps API key (removes the "API key required" watermark).
  cartoApiKey: process.env.CARTO_API_KEY || "",
};
