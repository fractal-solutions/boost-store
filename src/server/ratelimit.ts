type Entry = { count: number; resetAt: number };

const hits = new Map<string, Entry>();

/** Fixed-window rate limiter. Returns false when the limit is exceeded. */
export function rateLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const entry = hits.get(key);
  if (!entry || entry.resetAt <= now) {
    hits.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (entry.count >= max) return false;
  entry.count += 1;
  return true;
}

const cleanup = setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of hits) {
    if (entry.resetAt <= now) hits.delete(key);
  }
}, 60_000);
// Do not keep the process alive just for cleanup.
(cleanup as { unref?: () => void }).unref?.();
