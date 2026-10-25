import { ApiError, loadToday, readPlayerId } from "@/lib/server/game-service";
import { handle } from "@/lib/server/http";
import { isPlausibleLocalDate } from "@/lib/game";

export const dynamic = "force-dynamic";

/** GET /api/puzzle/today?date=YYYY-MM-DD  (the player's local date) */
export async function GET(req: Request) {
  return handle(async () => {
    const playerId = readPlayerId(req);
    const date = new URL(req.url).searchParams.get("date") || "";
    if (!isPlausibleLocalDate(date)) throw new ApiError(400, "wrong_day", "Your device's date looks wrong. Check your clock.");
    return loadToday(playerId, date);
  });
}
