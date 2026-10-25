import { env } from "@/lib/env";

/**
 * Fixed-window rate limit: `limit` calls per `windowSec` per key.
 * Uses Upstash Redis when configured (shared by every server), otherwise an in-memory map per server instance.
 */
const memory = new Map<string, { count: number; resetAt: number }>();

export async function rateLimit(key: string, limit = 20, windowSec = 60): Promise<boolean> {
  const upstash = env.upstash();
  const bucket = `rl:${key}:${Math.floor(Date.now() / 1000 / windowSec)}`;

  if (upstash) {
    try {
      const res = await fetch(`${upstash.url}/pipeline`, {
        method: "POST",
        headers: { Authorization: `Bearer ${upstash.token}`, "Content-Type": "application/json" },
        body: JSON.stringify([
          ["INCR", bucket],
          ["EXPIRE", bucket, String(windowSec)],
        ]),
        cache: "no-store",
      });
      const data = (await res.json()) as { result: number }[];
      return (data[0]?.result ?? 0) <= limit;
    } catch {
      return true; // never block play because the limiter is down
    }
  }

  const now = Date.now();
  const entry = memory.get(bucket);
  if (!entry || entry.resetAt < now) {
    memory.set(bucket, { count: 1, resetAt: now + windowSec * 1000 });
    if (memory.size > 5000) memory.forEach((v, k) => v.resetAt < now && memory.delete(k));
    return true;
  }
  entry.count++;
  return entry.count <= limit;
}

export function clientIp(req: Request): string {
  return (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "unknown";
}
