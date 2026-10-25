import { ApiError, linkPlayerToUser, readPlayerId } from "@/lib/server/game-service";
import { getUser } from "@/lib/supabase/server";
import { handle } from "@/lib/server/http";
import { isPlausibleLocalDate } from "@/lib/game";

export const dynamic = "force-dynamic";

/** POST /api/auth/link  body: { date }. Called right after sign-in to merge this device's history into the account. */
export async function POST(req: Request) {
  return handle(async () => {
    const playerId = readPlayerId(req);
    const user = await getUser();
    if (!user) throw new ApiError(401, "signed_out", "Sign in first.");
    const body = (await req.json().catch(() => ({}))) as { date?: unknown };
    const date = String(body.date || "");
    if (!isPlausibleLocalDate(date)) throw new ApiError(400, "wrong_day");
    const stats = await linkPlayerToUser(playerId, user.id, date);
    return { email: user.email, stats };
  });
}
