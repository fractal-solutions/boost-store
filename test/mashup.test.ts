import { expect, test } from "bun:test";
import { buildMashup } from "../src/server/mashup";
import type { ProductApi } from "../src/server/products";

function product(overrides: Partial<ProductApi>): ProductApi {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    name: overrides.name ?? "Product",
    slug: "product",
    description: "",
    price: overrides.price ?? 1000,
    compareAtPrice: overrides.compareAtPrice ?? null,
    category: overrides.category ?? "General",
    image: "seed",
    tags: [],
    stock: overrides.stock ?? 10,
    status: "active",
    featured: overrides.featured ?? false,
    rating: overrides.rating ?? 4.5,
    createdAt: overrides.createdAt ?? new Date(2024, 0, 1).toISOString(),
    updatedAt: new Date(2024, 0, 1).toISOString(),
  };
}

const catalogue: ProductApi[] = [
  product({ id: "a", category: "Home", price: 5000, compareAtPrice: 9000, featured: true, rating: 4.9 }),
  product({ id: "b", category: "Home", price: 2000, featured: true }),
  product({ id: "c", category: "Home", price: 1500 }),
  product({ id: "d", category: "Home", price: 1200 }),
  product({ id: "e", category: "Electronics", price: 4000, featured: true, rating: 4.8 }),
  product({ id: "f", category: "Fashion", price: 3000 }),
  product({ id: "g", category: "Kitchen", price: 800 }),
  product({ id: "h", category: "Wellness", price: 600 }),
];

test("respects the requested limit", () => {
  const result = buildMashup(catalogue, new Map(), { limit: 3, seed: "2024-01-01" });
  expect(result.items).toHaveLength(3);
});

test("keeps the mashup diverse across categories", () => {
  const result = buildMashup(catalogue, new Map(), { limit: 4, seed: "2024-01-01" });
  const categories = new Set(result.items.map((item) => item.product.category));
  // The dominant "Home" category must not crowd out everything else.
  expect(categories.size).toBeGreaterThan(1);
  expect(result.items.filter((item) => item.product.category === "Home").length).toBeLessThanOrEqual(2);
});

test("is deterministic for the same seed", () => {
  const first = buildMashup(catalogue, new Map(), { limit: 5, seed: "fixed" });
  const second = buildMashup(catalogue, new Map(), { limit: 5, seed: "fixed" });
  expect(first.items.map((item) => item.product.id)).toEqual(second.items.map((item) => item.product.id));
});

test("the deals theme surfaces the biggest discount first", () => {
  const result = buildMashup(catalogue, new Map(), { theme: "deals", limit: 1, seed: "fixed" });
  expect(result.items[0]?.product.id).toBe("a");
});

test("the trending theme leans on sales", () => {
  const popularity = new Map([
    ["g", 40],
    ["h", 5],
  ]);
  const result = buildMashup(catalogue, popularity, { theme: "trending", limit: 1, seed: "fixed" });
  expect(result.items[0]?.product.id).toBe("g");
});

test("every item carries a human-readable reason", () => {
  const result = buildMashup(catalogue, new Map(), { limit: 4, seed: "2024-01-01" });
  for (const item of result.items) expect(item.reason.length).toBeGreaterThan(0);
});
