import { db } from "./db";
import { defaultSettings, defaultTheme, type StoreSettings } from "./defaults";
import { notFound, nowIso, parseJson, str } from "./lib";

export type StoreRow = {
  id: string;
  merchant_id: string;
  name: string;
  slug: string;
  description: string;
  currency: string;
  contact_email: string;
  announcement: string;
  theme: string;
  settings: string;
  created_at: string;
  updated_at: string;
};

export async function getStoreRow(storeId: string): Promise<StoreRow> {
  const rows = await db`SELECT * FROM stores WHERE id = ${storeId} LIMIT 1`;
  const row = rows[0] as StoreRow | undefined;
  if (!row) throw notFound("Store not found.");
  return row;
}

export function getSettings(store: StoreRow): StoreSettings {
  return { ...defaultSettings(), ...parseJson<Partial<StoreSettings>>(store.settings, {}) };
}

export function getTheme(store: StoreRow): Record<string, unknown> {
  return { ...defaultTheme(), ...parseJson<Record<string, unknown>>(store.theme, {}) };
}

const SECRET_KEYS = new Set(["consumerSecret", "passkey", "consumerKey", "securityCredential"]);
const MASK = "••••••••";

export function maskSettings(settings: StoreSettings): StoreSettings {
  const clone = structuredClone(settings);
  const mpesa = clone.payments.mpesa ?? {};
  for (const key of Object.keys(mpesa)) {
    if (SECRET_KEYS.has(key) && typeof mpesa[key] === "string" && mpesa[key]) mpesa[key] = MASK;
  }
  return clone;
}

export async function updateStore(
  storeId: string,
  body: Record<string, unknown>,
): Promise<{ store: StoreRow; settings: StoreSettings }> {
  const store = await getStoreRow(storeId);
  const settings = getSettings(store);

  const fields: Record<string, unknown> = {};
  if (typeof body.name === "string") fields.name = body.name.trim();
  if (typeof body.description === "string") fields.description = body.description;
  if (typeof body.currency === "string") fields.currency = body.currency.toUpperCase();
  if (typeof body.contactEmail === "string") fields.contact_email = body.contactEmail;
  if (typeof body.announcement === "string") fields.announcement = body.announcement;
  if (body.theme && typeof body.theme === "object") fields.theme = JSON.stringify({ ...getTheme(store), ...(body.theme as object) });

  // Settings patches (payments / delivery / paymentTiming / defaultPaymentGateway).
  if (body.paymentTiming === "prepay" || body.paymentTiming === "cod") settings.paymentTiming = body.paymentTiming;
  if (typeof body.defaultPaymentGateway === "string") settings.defaultPaymentGateway = body.defaultPaymentGateway;
  if (body.payments && typeof body.payments === "object") {
    for (const [key, value] of Object.entries(body.payments as Record<string, unknown>)) {
      const existing = settings.payments[key] ?? {};
      const incoming = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
      const merged: Record<string, unknown> = { ...existing };
      for (const [k, v] of Object.entries(incoming)) {
        // Ignore empty strings and re-submitted masks so stored secrets survive.
        if (v === MASK || v === "") continue;
        merged[k] = v;
      }
      settings.payments[key] = merged;
    }
  }
  if (body.delivery && typeof body.delivery === "object") {
    settings.delivery = { ...settings.delivery, ...(body.delivery as object) } as StoreSettings["delivery"];
  }
  if (body.pickup && typeof body.pickup === "object") {
    settings.pickup = { ...settings.pickup, ...(body.pickup as object) } as StoreSettings["pickup"];
  }
  if (body.demoDropoff && typeof body.demoDropoff === "object") {
    settings.demoDropoff = { ...settings.demoDropoff, ...(body.demoDropoff as object) } as StoreSettings["demoDropoff"];
  }
  if (typeof body.terms === "string") settings.terms = body.terms;
  if (body.otp && typeof body.otp === "object") {
    settings.otp = { ...settings.otp, ...(body.otp as object) } as StoreSettings["otp"];
  }
  if (body.purchases && typeof body.purchases === "object") {
    settings.purchases = { ...settings.purchases, ...(body.purchases as object) } as StoreSettings["purchases"];
  }
  if (body.tax && typeof body.tax === "object") {
    settings.tax = { ...settings.tax, ...(body.tax as object) } as StoreSettings["tax"];
  }
  if (body.notifications && typeof body.notifications === "object") {
    settings.notifications = { ...settings.notifications, ...(body.notifications as object) } as StoreSettings["notifications"];
  }
  if (body.accounting && typeof body.accounting === "object") {
    settings.accounting = { ...settings.accounting, ...(body.accounting as object) } as StoreSettings["accounting"];
  }
  fields.settings = JSON.stringify(settings);
  fields.updated_at = nowIso();

  const keys = Object.keys(fields);
  if (keys.length > 0) {
    await db`UPDATE stores SET ${db(fields, ...keys)} WHERE id = ${storeId}`;
  }
  return { store: await getStoreRow(storeId), settings };
}

export function storeSummary(store: StoreRow, settings: StoreSettings) {
  return {
    id: store.id,
    name: store.name,
    slug: store.slug,
    description: str(store.description),
    currency: store.currency,
    contactEmail: str(store.contact_email),
    announcement: str(store.announcement),
    theme: getTheme(store),
    settings: maskSettings(settings),
  };
}

/** Public storefront payload — omits integrations, credentials and internal config. */
export function publicStoreSummary(store: StoreRow, settings: StoreSettings) {
  return {
    id: store.id,
    name: store.name,
    slug: store.slug,
    description: str(store.description),
    currency: store.currency,
    contactEmail: str(store.contact_email),
    announcement: str(store.announcement),
    theme: getTheme(store),
    settings: {
      paymentTiming: settings.paymentTiming,
      pickup: settings.pickup,
      demoDropoff: settings.demoDropoff,
      tax: settings.tax,
    },
  };
}
