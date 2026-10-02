import { env } from "./env";

export type StoreSettings = {
  paymentTiming: "prepay" | "cod";
  defaultPaymentGateway: string;
  payments: Record<string, Record<string, unknown>>;
  delivery: {
    provider: string;
    markup: number;
    boostCarrier: { baseUrl: string; customerId: string };
  };
  pickup: {
    street_address: string[];
    city: string;
    country: string;
    latitude: number;
    longitude: number;
  };
  // Coordinates used for the delivery map when a customer does not pin a
  // location at checkout.
  demoDropoff: { latitude: number; longitude: number };
  // Customer onboarding / OTP integration (n8n or similar webhook).
  otp: { webhookUrl: string };
  // Purchase-order integration (n8n or similar webhook) that sends POs to vendors.
  purchases: { webhookUrl: string };
  // Sales tax / VAT.
  tax: { enabled: boolean; rate: number; inclusive: boolean };
  // Customer order notifications (n8n or similar webhook).
  notifications: { webhookUrl: string };
  // Terms & conditions shown at signup; editable from the admin panel.
  terms: string;
  // Balance-sheet presentation options.
  accounting: {
    includeCash: boolean;
    includeReceivables: boolean;
    includeInventory: boolean;
    inventoryBasis: "cost" | "retail";
    includePayables: boolean;
  };
};

export const DEFAULT_TERMS = [
  "## Terms & Conditions",
  "",
  "By creating an account you agree to these terms.",
  "",
  "- We collect your name, email and phone number to fulfil your orders and send delivery and OTP notifications.",
  "- We may contact you by email or WhatsApp about your orders.",
  "- Your data is stored securely and is not sold to third parties.",
  "- You can request deletion of your account at any time.",
  "",
  "Replace this text in Admin → Settings to match your business.",
].join("\n");

export function defaultSettings(): StoreSettings {
  return {
    paymentTiming: env.defaultPaymentTiming,
    defaultPaymentGateway: "mock",
    payments: {
      mock: { enabled: true },
      mpesa: {
        enabled: env.mpesaEnabled,
        environment: env.mpesaEnvironment,
        consumerKey: env.mpesaConsumerKey,
        consumerSecret: env.mpesaConsumerSecret,
        passkey: env.mpesaPasskey,
        shortcode: env.mpesaShortcode,
      },
    },
    delivery: {
      provider: env.deliveryProvider,
      markup: 0,
      boostCarrier: {
        baseUrl: env.boostCarrierUrl,
        customerId: env.boostCarrierCustomerId,
      },
    },
    pickup: {
      street_address: ["123 Boost Warehouse Road"],
      city: "Nairobi",
      country: "KE",
      latitude: env.demoPickupLat,
      longitude: env.demoPickupLng,
    },
    demoDropoff: { latitude: env.demoDropoffLat, longitude: env.demoDropoffLng },
    otp: { webhookUrl: env.otpWebhookUrl },
    purchases: { webhookUrl: env.purchaseWebhookUrl },
    tax: { enabled: false, rate: 16, inclusive: false },
    notifications: { webhookUrl: env.notifyWebhookUrl },
    terms: DEFAULT_TERMS,
    accounting: {
      includeCash: true,
      includeReceivables: true,
      includeInventory: true,
      inventoryBasis: "cost",
      includePayables: true,
    },
  };
}

export function defaultTheme() {
  return {
    primary: "#4f46e5",
    accent: "#f59e0b",
    heroHeadline: "Everyday essentials, delivered in minutes.",
    heroSubhead: "Curated products from independent makers, brought to your door by Boost.",
    heroCta: "Shop the drop",
    heroImage: "",
    gridColumns: 4,
  };
}

export type SeedProduct = {
  name: string;
  price: number;
  compareAtPrice?: number;
  category: string;
  image: string;
  tags: string[];
  stock: number;
  featured: boolean;
  rating: number;
  description: string;
};

export const SEED_PRODUCTS: SeedProduct[] = [
  { name: "Aurora Table Lamp", price: 4200, compareAtPrice: 5200, category: "Home & Living", image: "aurora-lamp", tags: ["lighting", "warm"], stock: 24, featured: true, rating: 4.8, description: "A dimmable brass lamp with a warm halo glow for late-night reading." },
  { name: "Nimbus Desk Speaker", price: 8900, category: "Electronics", image: "nimbus-speaker", tags: ["audio", "bluetooth"], stock: 15, featured: true, rating: 4.7, description: "Compact 360° speaker with deep bass and 18-hour battery." },
  { name: "Terra Mug Set", price: 2400, compareAtPrice: 3000, category: "Kitchen", image: "terra-mugs", tags: ["ceramic", "gift"], stock: 40, featured: false, rating: 4.5, description: "Four hand-glazed stoneware mugs that keep coffee warmer for longer." },
  { name: "Lumen Smart Bulb", price: 1500, category: "Electronics", image: "lumen-bulb", tags: ["smart", "lighting"], stock: 60, featured: false, rating: 4.4, description: "16M-colour Wi-Fi bulb with schedules and scenes." },
  { name: "Drift Wireless Earbuds", price: 6500, compareAtPrice: 8200, category: "Electronics", image: "drift-earbuds", tags: ["audio", "travel"], stock: 30, featured: true, rating: 4.6, description: "Feather-light earbuds with adaptive noise cancelling." },
  { name: "Nomad Canvas Backpack", price: 5800, category: "Fashion", image: "nomad-backpack", tags: ["bag", "travel"], stock: 22, featured: false, rating: 4.7, description: "Water-resistant 22L pack with a padded laptop sleeve." },
  { name: "Kite Running Shoes", price: 7200, compareAtPrice: 9000, category: "Fashion", image: "kite-shoes", tags: ["sport", "running"], stock: 18, featured: false, rating: 4.5, description: "Responsive foam midsole built for daily mileage." },
  { name: "Ember Cast Iron Pan", price: 3900, category: "Kitchen", image: "ember-pan", tags: ["cooking", "durable"], stock: 26, featured: false, rating: 4.9, description: "Pre-seasoned 10-inch skillet that sears like a steakhouse." },
  { name: "Mist Aroma Diffuser", price: 3200, category: "Wellness", image: "mist-diffuser", tags: ["calm", "home"], stock: 34, featured: false, rating: 4.3, description: "Ultrasonic diffuser with a soft amber night light." },
  { name: "Peak Trail Bottle", price: 1900, compareAtPrice: 2500, category: "Outdoors", image: "peak-bottle", tags: ["hydration", "steel"], stock: 55, featured: false, rating: 4.6, description: "Insulated 750ml bottle that keeps drinks cold for 24 hours." },
  { name: "Halo Ring Light", price: 4600, category: "Electronics", image: "halo-ring", tags: ["creator", "lighting"], stock: 20, featured: false, rating: 4.4, description: "18-inch bi-colour ring light with a sturdy desk arm." },
  { name: "Fern Linen Throw", price: 5400, category: "Home & Living", image: "fern-throw", tags: ["cozy", "linen"], stock: 16, featured: false, rating: 4.8, description: "Stonewashed linen throw that gets softer with every wash." },
];
