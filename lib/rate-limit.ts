import { createHash } from "node:crypto";

const buckets = new Map<string, number[]>();

/** True when the caller may proceed. The stored key is a hash, not an IP address. */
export function allowRequest(key: string, limit = 8, windowMs = 60_000, now = Date.now()): boolean {
  const recent = (buckets.get(key) ?? []).filter((stamp) => now - stamp < windowMs);
  if (recent.length >= limit) {
    buckets.set(key, recent);
    return false;
  }
  recent.push(now);
  buckets.set(key, recent);
  return true;
}

export function resetRateLimit(): void {
  buckets.clear();
}

export function requestRateKey(request: Request, scope: string): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "";
  const raw = forwarded || request.headers.get("x-real-ip")?.trim() || "unknown";
  return createHash("sha256").update(`${scope}:${raw}`).digest("hex").slice(0, 20);
}
