/**
 * Client-side cache for GA4 reports backed by localStorage.
 * TTL: 5 minutes. Keys are namespaced by workspace + property + report params.
 */

const TTL_MS = 5 * 60 * 1000;
const PREFIX = "ga4_cache:";

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

function buildKey(parts: Array<string | undefined | null>): string {
  return PREFIX + parts.map((p) => p ?? "_").join("|");
}

export function getGa4Cache<T>(parts: Array<string | undefined | null>): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(buildKey(parts));
    if (!raw) return null;
    const entry = JSON.parse(raw) as CacheEntry<T>;
    if (Date.now() > entry.expiresAt) {
      window.localStorage.removeItem(buildKey(parts));
      return null;
    }
    return entry.value;
  } catch {
    return null;
  }
}

export function setGa4Cache<T>(parts: Array<string | undefined | null>, value: T): void {
  if (typeof window === "undefined") return;
  try {
    const entry: CacheEntry<T> = { value, expiresAt: Date.now() + TTL_MS };
    window.localStorage.setItem(buildKey(parts), JSON.stringify(entry));
  } catch {
    /* quota exceeded — ignore */
  }
}

export function clearGa4Cache(): void {
  if (typeof window === "undefined") return;
  try {
    const keys: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k && k.startsWith(PREFIX)) keys.push(k);
    }
    keys.forEach((k) => window.localStorage.removeItem(k));
  } catch {
    /* ignore */
  }
}
