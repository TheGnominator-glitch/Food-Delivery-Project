interface Entry {
  timestamps: number[];
  windowMs: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

const globalForRateLimit = globalThis as unknown as {
  rateLimitStore?: Map<string, Entry>;
};

if (!globalForRateLimit.rateLimitStore) {
  globalForRateLimit.rateLimitStore = new Map();
}
const store = globalForRateLimit.rateLimitStore;

const SWEEP_INTERVAL_MS = 10 * 60 * 1000;
let lastSweep = Date.now();

function sweepExpired(now: number) {
  if (now - lastSweep < SWEEP_INTERVAL_MS) return;
  lastSweep = now;

  for (const [key, entry] of store) {
    const newest = entry.timestamps[entry.timestamps.length - 1];
    if (newest === undefined || now - newest >= entry.windowMs) {
      store.delete(key);
    }
  }
}

export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number
): RateLimitResult {
  const now = Date.now();
  sweepExpired(now);

  const entry = store.get(key);
  const recent = (entry?.timestamps ?? []).filter((t) => now - t < windowMs);

  if (recent.length >= limit) {
    store.set(key, { timestamps: recent, windowMs });
    const retryAfterMs = windowMs - (now - recent[0]);
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.ceil(retryAfterMs / 1000),
    };
  }

  recent.push(now);
  store.set(key, { timestamps: recent, windowMs });
  return {
    allowed: true,
    remaining: limit - recent.length,
    retryAfterSeconds: 0,
  };
}

export function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  return request.headers.get("x-real-ip") ?? "unknown";
}