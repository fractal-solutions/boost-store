import type { SQL } from "bun";
import { defaultSettings, defaultTheme, SEED_PRODUCTS } from "./defaults";
import { newId, nowIso, slugify } from "./lib";

const DEFAULT_HOURS = JSON.stringify({ alwaysOpen: true, days: ["mon", "tue", "wed", "thu", "fri", "sat"], open: "08:00", close: "18:00" });

const DEMO_EMAIL = process.env.DEMO_MERCHANT_EMAIL || "demo@booststore.app";
const DEMO_PASSWORD = process.env.DEMO_MERCHANT_PASSWORD || "booststore";

export async function seedIfEmpty(db: SQL): Promise<void> {
  const rows = await db`SELECT COUNT(*) AS count FROM merchants`;
  const count = Number((rows[0] as { count: number } | undefined)?.count ?? 0);
  if (count > 0) return;

  const now = nowIso();
  const merchantId = newId("mer");
  const storeId = newId("store");
  const warehouseId = newId("wh");
  const passwordHash = await Bun.password.hash(DEMO_PASSWORD);
  const settings = defaultSettings();

  await db.begin(async (tx) => {
    await tx`INSERT INTO merchants ${tx({ id: merchantId, name: "Demo Merchant", email: DEMO_EMAIL, password_hash: passwordHash, created_at: now })}`;
    await tx`INSERT INTO stores ${tx({
      id: storeId,
      merchant_id: merchantId,
      name: "Boost Store",
      slug: "boost-store",
      description: "A modern storefront powered by Boost delivery and M-PESA.",
      currency: "KES",
      contact_email: DEMO_EMAIL,
      announcement: "Free delivery on orders over KES 10,000",
      theme: JSON.stringify(defaultTheme()),
      settings: JSON.stringify(settings),
      created_at: now,
      updated_at: now,
    })}`;

    await tx`INSERT INTO warehouses ${tx({
      id: warehouseId,
      store_id: storeId,
      name: "Main Warehouse",
      code: "MAIN",
      contact_name: "Demo Merchant",
      phone: "+254700000000",
      email: DEMO_EMAIL,
      street_address: settings.pickup.street_address.join(", "),
      city: settings.pickup.city,
      country: settings.pickup.country,
      latitude: settings.pickup.latitude,
      longitude: settings.pickup.longitude,
      hours: DEFAULT_HOURS,
      active: 1,
      created_at: now,
      updated_at: now,
    })}`;

    for (const product of SEED_PRODUCTS) {
      const productId = newId("prod");
      await tx`INSERT INTO products ${tx({
        id: productId,
        store_id: storeId,
        name: product.name,
        slug: slugify(product.name),
        description: product.description,
        price: product.price,
        compare_at_price: product.compareAtPrice ?? null,
        category: product.category,
        image: product.image,
        tags: JSON.stringify(product.tags),
        stock: product.stock,
        status: "active",
        featured: product.featured ? 1 : 0,
        rating: product.rating,
        warehouse_id: warehouseId,
        cost: Math.round(product.price * 0.6),
        created_at: now,
        updated_at: now,
      })}`;
      await tx`INSERT INTO inventory ${tx({
        id: newId("inv"),
        store_id: storeId,
        product_id: productId,
        warehouse_id: warehouseId,
        quantity: product.stock,
        reorder_level: 5,
        updated_at: now,
      })}`;
    }
  });

  console.log(`Seeded demo store "${"Boost Store"}" (${DEMO_EMAIL} / ${DEMO_PASSWORD})`);
}
