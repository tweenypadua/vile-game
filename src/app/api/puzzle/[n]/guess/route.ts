import { ApiError, act, readPlayerId } from "@/lib/server/game-service";
import { handle } from "@/lib/server/http";
import { isPlausibleLocalDate } from "@/lib/game";
import { clientIp, rateLimit } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";

/** POST /api/puzzle/:n/guess  body: { guess, filmId?, date } */
export async function POST(req: Request, { params }: { params: { n: string } }) {
  return handle(async () => {
    const playerId = readPlayerId(req);
    if (!(await rateLimit(`p:${playerId}`)) || !(await rateLimit(`ip:${clientIp(req)}`, 60))) {
      throw new ApiError(429, "rate_limited", "Too many guesses. Wait a minute and try again.");
    }
    const body = (await req.json().catch(() => ({}))) as { guess?: unknown; filmId?: unknown; date?: unknown };
    const date = String(body.date || "");
    if (!isPlausibleLocalDate(date)) throw new ApiError(400, "wrong_day", "Your device's date looks wrong.");
    const filmId = Number.isInteger(body.filmId) ? (body.filmId as number) : undefined;
    return act(playerId, Number(params.n), date, { kind: "guess", text: String(body.guess || ""), filmId });
  });
}
