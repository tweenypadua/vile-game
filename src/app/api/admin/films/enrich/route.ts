import { handle } from "@/lib/server/http";
import { requireAdmin, upsertFilmFromTmdb } from "@/lib/server/admin";
import { db } from "@/lib/supabase/server";
import { getMovie, searchMovies } from "@/lib/tmdb";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/admin/films/enrich
 * Finds every case's film on TMDB by title and year, and saves its TMDB id, genres and poster.
 * Safe to run more than once. Returns which films matched and which need a manual import.
 */
export async function POST() {
  return handle(async () => {
    await requireAdmin();
    const { data, error } = await db().from("puzzles").select("films(id, title, release_year, tmdb_id, poster_url)");
    if (error) throw error;

    const films = (data || []).map((r: any) => r.films).filter((f: any) => f && (!f.tmdb_id || !f.poster_url));
    const matched: string[] = [];
    const unmatched: string[] = [];
    for (const f of films) {
      const results = await searchMovies(f.title, f.release_year);
      const hit = results.find((r) => r.year === f.release_year) ?? null;
      if (!hit) {
        unmatched.push(`${f.title} (${f.release_year})`);
        continue;
      }
      await upsertFilmFromTmdb(await getMovie(hit.tmdbId));
      matched.push(`${f.title} (${f.release_year})`);
    }
    return { matched, unmatched };
  });
}
