import { handle } from "@/lib/server/http";
import { importFilm, requireAdmin } from "@/lib/server/admin";
import { ApiError } from "@/lib/server/game-service";

export const dynamic = "force-dynamic";

/** POST /api/admin/films/import  body: { tmdbId, aliases?: string[] }  →  { filmId } */
export async function POST(req: Request) {
  return handle(async () => {
    await requireAdmin();
    const body = (await req.json().catch(() => ({}))) as { tmdbId?: unknown; aliases?: unknown };
    const tmdbId = Number(body.tmdbId);
    if (!Number.isInteger(tmdbId) || tmdbId <= 0) throw new ApiError(400, "bad_tmdb_id");
    const aliases = Array.isArray(body.aliases) ? body.aliases.map(String) : [];
    return { filmId: await importFilm(tmdbId, aliases) };
  });
}
