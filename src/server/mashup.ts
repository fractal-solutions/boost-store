import type { ProductApi } from "./products";

export const MASHUP_THEMES = ["curated", "deals", "trending", "fresh"] as const;
export type MashupTheme = (typeof MASHUP_THEMES)[number];

export const THEME_COPY: Record<MashupTheme, { title: string; subtitle: string }> = {
  curated: { title: "Today's mashup", subtitle: "A hand-blended edit across the whole catalogue." },
  deals: { title: "Steal of the day", subtitle: "The sharpest markdowns, mixed so nothing feels samey." },
  trending: { title: "What everyone's buying", subtitle: "Ranked by real orders from this store." },
  fresh: { title: "Just landed", subtitle: "The newest arrivals, stirred into the mix." },
};

type Weights = { featured: number; discount: number; popularity: number; recency: number; rating: number; jitter: number };

// Each theme leans on a different signal so the hero feels different day to day.
const WEIGHTS: Record<MashupTheme, Weights> = {
  curated: { featured: 1.2, discount: 0.7, popularity: 1.0, recency: 0.5, rating: 0.9, jitter: 0.4 },
  deals: { featured: 0.4, discount: 2.4, popularity: 0.6, recency: 0.3, rating: 0.5, jitter: 0.35 },
  trending: { featured: 0.8, discount: 0.4, popularity: 2.2, recency: 0.6, rating: 0.8, jitter: 0.45 },
  fresh: { featured: 0.6, discount: 0.3, popularity: 0.4, recency: 2.4, rating: 0.5, jitter: 0.4 },
};

export interface MashupItem {
  product: ProductApi;
  score: number;
  reason: string;
}

export interface MashupResult {
  theme: MashupTheme;
  title: string;
  subtitle: string;
  seed: string;
  items: MashupItem[];
}

function hashString(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function daySeed(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

function normalize(value: number, min: number, max: number): number {
  if (max <= min) return 1;
  return Math.max(0, Math.min(1, (value - min) / (max - min)));
}

function discountOf(product: ProductApi): number {
  if (!product.compareAtPrice || product.compareAtPrice <= product.price) return 0;
  return (product.compareAtPrice - product.price) / product.compareAtPrice;
}

function reasonFor(theme: MashupTheme, product: ProductApi, sold: number): string {
  const discount = discountOf(product);
  if (theme === "deals" && discount > 0) return `${Math.round(discount * 100)}% off`;
  if (theme === "trending" && sold > 0) return `${sold} sold this week`;
  if (theme === "fresh") return "New arrival";
  if (product.featured) return "Editor's pick";
  if (discount > 0) return `${Math.round(discount * 100)}% off`;
  return `Rated ${product.rating.toFixed(1)}`;
}

/**
 * Blend products into a diverse hero collection.
 *
 * 1. Score every product from weighted signals (featured, discount, sales,
 *    recency, rating) plus a deterministic per-day jitter so the hero rotates
 *    but stays stable within a day.
 * 2. Greedily pick from the highest score down, capping how many products one
 *    category can contribute so the mashup never becomes a wall of one thing.
 * 3. Backfill from the remaining ranked list if the cap left the shelf short.
 */
export function buildMashup(
  products: ProductApi[],
  popularity: Map<string, number>,
  options: { theme?: MashupTheme; limit?: number; seed?: string } = {},
): MashupResult {
  const theme: MashupTheme = options.theme && MASHUP_THEMES.includes(options.theme) ? options.theme : "curated";
  const limit = Math.max(1, Math.min(options.limit ?? 8, products.length || 1));
  const seed = options.seed || daySeed();
  const weights = WEIGHTS[theme];
  const random = mulberry32(hashString(`${theme}:${seed}`));

  const maxPopularity = Math.max(1, ...popularity.values());
  const created = products.map((p) => new Date(p.createdAt).getTime());
  const minCreated = Math.min(...created);
  const maxCreated = Math.max(...created);

  const scored = products
    .map((product) => {
      const sold = popularity.get(product.id) ?? 0;
      const signals =
        weights.featured * (product.featured ? 1 : 0) +
        weights.discount * discountOf(product) +
        weights.popularity * (sold / maxPopularity) +
        weights.recency * normalize(new Date(product.createdAt).getTime(), minCreated, maxCreated) +
        weights.rating * normalize(product.rating, 3.5, 5) +
        weights.jitter * random();
      return { product, score: signals, reason: reasonFor(theme, product, sold) };
    })
    .sort((a, b) => b.score - a.score);

  const categoryCount = new Set(products.map((p) => p.category || "Other")).size;
  const maxPerCategory = Math.max(1, Math.ceil(limit / Math.max(2, categoryCount)));
  const perCategory = new Map<string, number>();
  const picked: MashupItem[] = [];

  for (const item of scored) {
    const category = item.product.category || "Other";
    if ((perCategory.get(category) ?? 0) >= maxPerCategory) continue;
    perCategory.set(category, (perCategory.get(category) ?? 0) + 1);
    picked.push(item);
    if (picked.length >= limit) break;
  }

  if (picked.length < limit) {
    for (const item of scored) {
      if (picked.includes(item)) continue;
      picked.push(item);
      if (picked.length >= limit) break;
    }
  }

  return { theme, ...THEME_COPY[theme], seed, items: picked };
}
