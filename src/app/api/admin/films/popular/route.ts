import { handle } from "@/lib/server/http";
import { requireAdmin, upsertFilmFromTmdb } from "@/lib/server/admin";
import { popularMovies } from "@/lib/tmdb";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/admin/films/popular  body: { pages?: number }
 * Adds TMDB's top-rated and popular films to the guess list (20 films per page per list).
 */
export async function POST(req: Request) {
  return handle(async () => {
    await requireAdmin();
    const body = (await req.json().catch(() => ({}))) as { pages?: unknown };
    const pages = Math.min(10, Math.max(1, Number(body.pages) || 3));
    let added = 0;
    for (const list of ["top_rated", "popular"] as const) {
      for (let page = 1; page <= pages; page++) {
        for (const film of await popularMovies(list, page)) {
          if (!film.year) continue;
          await upsertFilmFromTmdb(film);
          added++;
        }
      }
    }
    return { saved: added };
  });
}
