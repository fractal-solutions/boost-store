import { db } from "./db";
import { newId, nowIso, parseJson, slugify, str } from "./lib";

export type ProductRow = {
  id: string;
  store_id: string;
  name: string;
  slug: string;
  description: string;
  price: number;
  compare_at_price: number | null;
  category: string;
  image: string;
  tags: string;
  stock: number;
  status: string;
  featured: number;
  rating: number;
  created_at: string;
  updated_at: string;
};

export type ProductApi = {
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

export function hydrateProduct(row: ProductRow): ProductApi {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: str(row.description),
    price: Number(row.price),
    compareAtPrice: row.compare_at_price === null ? null : Number(row.compare_at_price),
    category: str(row.category),
    image: str(row.image),
    tags: parseJson<string[]>(row.tags, []),
    stock: Number(row.stock),
    status: row.status,
    featured: Number(row.featured) === 1,
    rating: Number(row.rating),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getProductRow(storeId: string, productId: string): Promise<ProductRow | undefined> {
  const rows = await db`SELECT * FROM products WHERE id = ${productId} AND store_id = ${storeId} LIMIT 1`;
  return rows[0] as ProductRow | undefined;
}

export async function listProductRows(storeId: string): Promise<ProductRow[]> {
  return (await db`SELECT * FROM products WHERE store_id = ${storeId} ORDER BY created_at DESC`) as ProductRow[];
}

export async function listProducts(storeId: string, filters: { status?: string; category?: string; search?: string; featured?: boolean } = {}): Promise<ProductApi[]> {
  let rows = await listProductRows(storeId);
  if (filters.status) rows = rows.filter((r) => r.status === filters.status);
  if (filters.category) rows = rows.filter((r) => r.category === filters.category);
  if (filters.featured !== undefined) rows = rows.filter((r) => (Number(r.featured) === 1) === filters.featured);
  if (filters.search) {
    const q = filters.search.toLowerCase();
    rows = rows.filter((r) => r.name.toLowerCase().includes(q) || r.category.toLowerCase().includes(q));
  }
  return rows.map(hydrateProduct);
}

export async function getProduct(storeId: string, productId: string): Promise<ProductApi | undefined> {
  const row = await getProductRow(storeId, productId);
  return row ? hydrateProduct(row) : undefined;
}

export async function createProduct(storeId: string, body: Record<string, unknown>): Promise<ProductApi> {
  const name = str(body.name).trim();
  const price = Number(body.price);
  if (!name) throw new Error("Product name is required.");
  if (!Number.isFinite(price) || price <= 0) throw new Error("Price must be a positive number.");
  const now = nowIso();
  const id = newId("prod");
  const row: ProductRow = {
    id,
    store_id: storeId,
    name,
    slug: slugify(name),
    description: str(body.description),
    price,
    compare_at_price: body.compareAtPrice == null ? null : Number(body.compareAtPrice),
    category: str(body.category, "General"),
    image: str(body.image, slugify(name)),
    tags: JSON.stringify(Array.isArray(body.tags) ? body.tags : []),
    stock: Math.max(0, Math.trunc(Number(body.stock ?? 0))),
    status: str(body.status, "active"),
    featured: body.featured ? 1 : 0,
    rating: Number.isFinite(Number(body.rating)) ? Number(body.rating) : 4.6,
    created_at: now,
    updated_at: now,
  };
  await db`INSERT INTO products ${db(row)}`;
  return hydrateProduct(row);
}

export async function updateProduct(storeId: string, productId: string, body: Record<string, unknown>): Promise<ProductApi> {
  const row = await getProductRow(storeId, productId);
  if (!row) throw new Error("Product not found.");
  const fields: Record<string, unknown> = {};
  if (typeof body.name === "string" && body.name.trim()) {
    fields.name = body.name.trim();
    fields.slug = slugify(body.name);
  }
  if (typeof body.description === "string") fields.description = body.description;
  if (body.price !== undefined && Number.isFinite(Number(body.price))) fields.price = Number(body.price);
  if (body.compareAtPrice !== undefined) fields.compare_at_price = body.compareAtPrice == null ? null : Number(body.compareAtPrice);
  if (typeof body.category === "string") fields.category = body.category;
  if (typeof body.image === "string") fields.image = body.image;
  if (Array.isArray(body.tags)) fields.tags = JSON.stringify(body.tags);
  if (body.stock !== undefined) fields.stock = Math.max(0, Math.trunc(Number(body.stock)));
  if (typeof body.status === "string") fields.status = body.status;
  if (body.featured !== undefined) fields.featured = body.featured ? 1 : 0;
  if (body.rating !== undefined && Number.isFinite(Number(body.rating))) fields.rating = Number(body.rating);
  fields.updated_at = nowIso();
  const keys = Object.keys(fields);
  await db`UPDATE products SET ${db(fields, ...keys)} WHERE id = ${productId} AND store_id = ${storeId}`;
  return hydrateProduct((await getProductRow(storeId, productId))!);
}

export async function deleteProduct(storeId: string, productId: string): Promise<void> {
  await db`DELETE FROM products WHERE id = ${productId} AND store_id = ${storeId}`;
}

export async function productCategories(storeId: string): Promise<string[]> {
  const rows = await db`SELECT DISTINCT category FROM products WHERE store_id = ${storeId} AND status = 'active' AND category != '' ORDER BY category`;
  return (rows as { category: string }[]).map((r) => r.category);
}
