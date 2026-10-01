import { env } from "./env";

type CachedImage = { body: Uint8Array; type: string };

const cache = new Map<string, CachedImage>();
const inflight = new Map<string, Promise<CachedImage | null>>();

/**
 * Fetch a product image from the configured AI image provider (Pollinations by
 * default), with an in-memory cache and in-flight de-duplication. Returns null
 * when disabled or unavailable so the caller can fall back to an SVG.
 */
export async function productImage(seed: string, prompt: string, size: number): Promise<CachedImage | null> {
  if (!env.productImageEnabled) return null;
  const key = `${seed}:${size}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const existing = inflight.get(key);
  if (existing) return existing;

  const task = (async (): Promise<CachedImage | null> => {
    const url = env.productImageUrl
      .replace("{prompt}", encodeURIComponent(prompt))
      .replace("{seed}", encodeURIComponent(seed))
      .replace("{w}", String(size))
      .replace("{h}", String(size));
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": env.geocoderUserAgent, Accept: "image/*" },
        signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok) return null;
      const type = response.headers.get("content-type") || "image/jpeg";
      if (!type.startsWith("image/")) return null;
      const body = new Uint8Array(await response.arrayBuffer());
      if (body.length < 1500) return null;
      const image = { body, type };
      cache.set(key, image);
      return image;
    } catch {
      return null;
    }
  })();

  inflight.set(key, task);
  try {
    return await task;
  } finally {
    inflight.delete(key);
  }
}
