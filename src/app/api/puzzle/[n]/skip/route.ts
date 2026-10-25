import { ApiError, act, readPlayerId } from "@/lib/server/game-service";
import { handle } from "@/lib/server/http";
import { isPlausibleLocalDate } from "@/lib/game";
import { rateLimit } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";

/** POST /api/puzzle/:n/skip  body: { date } */
export async function POST(req: Request, { params }: { params: { n: string } }) {
  return handle(async () => {
    const playerId = readPlayerId(req);
    if (!(await rateLimit(`p:${playerId}`))) throw new ApiError(429, "rate_limited", "Slow down a little.");
    const body = (await req.json().catch(() => ({}))) as { date?: unknown };
    const date = String(body.date || "");
    if (!isPlausibleLocalDate(date)) throw new ApiError(400, "wrong_day", "Your device's date looks wrong.");
    return act(playerId, Number(params.n), date, { kind: "skip" });
  });
}
