import type { SQL } from "bun";
import { defaultSettings, defaultTheme, SEED_PRODUCTS } from "./defaults";
import { newId, nowIso, slugify } from "./lib";

const DEMO_EMAIL = process.env.DEMO_MERCHANT_EMAIL || "demo@booststore.app";
const DEMO_PASSWORD = process.env.DEMO_MERCHANT_PASSWORD || "booststore";

export async function seedIfEmpty(db: SQL): Promise<void> {
  const rows = await db`SELECT COUNT(*) AS count FROM merchants`;
  const count = Number((rows[0] as { count: number } | undefined)?.count ?? 0);
  if (count > 0) return;

  const now = nowIso();
  const merchantId = newId("mer");
  const storeId = newId("store");
  const passwordHash = await Bun.password.hash(DEMO_PASSWORD);

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
      settings: JSON.stringify(defaultSettings()),
      created_at: now,
      updated_at: now,
    })}`;

    for (const product of SEED_PRODUCTS) {
      await tx`INSERT INTO products ${tx({
        id: newId("prod"),
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
        created_at: now,
        updated_at: now,
      })}`;
    }
  });

  console.log(`Seeded demo store "${"Boost Store"}" (${DEMO_EMAIL} / ${DEMO_PASSWORD})`);
}
