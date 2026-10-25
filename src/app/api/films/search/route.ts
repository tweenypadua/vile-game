import { db } from "@/lib/supabase/server";
import { handle } from "@/lib/server/http";
import { normalizeTitle } from "@/lib/game";

export const dynamic = "force-dynamic";

/** GET /api/films/search?q=home al  →  [{ id, title, year }] for the guess box */
export async function GET(req: Request) {
  return handle(async () => {
    const q = normalizeTitle(new URL(req.url).searchParams.get("q") || "");
    if (q.length < 2) return [];
    const { data, error } = await db().rpc("search_films", { q, max_results: 8 });
    if (error) throw error;
    return ((data || []) as { id: number; title: string; release_year: number }[]).map((f) => ({ id: f.id, title: f.title, year: f.release_year }));
  });
}
