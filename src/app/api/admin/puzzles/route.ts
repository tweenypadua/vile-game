import { handle } from "@/lib/server/http";
import { requireAdmin } from "@/lib/server/admin";
import { ApiError } from "@/lib/server/game-service";
import { db } from "@/lib/supabase/server";
import { env } from "@/lib/env";
import { caseNumberFor, dateForCase } from "@/lib/game";

export const dynamic = "force-dynamic";

const KINDS = ["villain_defense", "villain_identity", "prosecution", "genre_year", "plot_summary"];

/** GET /api/admin/puzzles  →  the schedule, newest first, plus the next free date. */
export async function GET() {
  return handle(async () => {
    await requireAdmin();
    const { data, error } = await db()
      .from("puzzles")
      .select("puzzle_number, publish_date, state, films(title, release_year, poster_url, tmdb_id)")
      .order("puzzle_number", { ascending: false })
      .limit(60);
    if (error) throw error;
    const last = data?.[0];
    const nextNumber = last ? last.puzzle_number + 1 : 1;
    return { puzzles: data, nextNumber, nextDate: dateForCase(nextNumber, env.launchDate()) };
  });
}

/** POST /api/admin/puzzles  body: { filmId, clues: [5 strings], publishDate? } */
export async function POST(req: Request) {
  return handle(async () => {
    const user = await requireAdmin();
    const body = (await req.json().catch(() => ({}))) as { filmId?: unknown; clues?: unknown; publishDate?: unknown };
    const filmId = Number(body.filmId);
    const clues = Array.isArray(body.clues) ? body.clues.map((c) => String(c).trim()) : [];
    if (!Number.isInteger(filmId)) throw new ApiError(400, "bad_film", "Pick a film first.");
    if (clues.length !== 5 || clues.some((c) => !c)) throw new ApiError(400, "bad_clues", "Write all five clues.");

    const client = db();
    const last = await client.from("puzzles").select("puzzle_number").order("puzzle_number", { ascending: false }).limit(1);
    const nextNumber = (last.data?.[0]?.puzzle_number ?? 0) + 1;
    const date = typeof body.publishDate === "string" && body.publishDate ? body.publishDate : dateForCase(nextNumber, env.launchDate());
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new ApiError(400, "bad_date");
    // Case numbers follow the calendar, so a case's number always matches its date.
    const number = caseNumberFor(date, env.launchDate());

    const ins = await client
      .from("puzzles")
      .insert({ puzzle_number: number, publish_date: date, film_id: filmId, state: "scheduled", created_by: user.id })
      .select("id")
      .single();
    if (ins.error) {
      if (ins.error.code === "23505") throw new ApiError(409, "date_taken", `A case is already scheduled for ${date}.`);
      throw ins.error;
    }
    const cl = await client
      .from("puzzle_clues")
      .insert(clues.map((body, i) => ({ puzzle_id: ins.data.id, position: i + 1, kind: KINDS[i], body })));
    if (cl.error) throw cl.error;
    return { puzzleNumber: number, publishDate: date };
  });
}
