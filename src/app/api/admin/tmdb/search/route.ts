import { handle } from "@/lib/server/http";
import { requireAdmin } from "@/lib/server/admin";
import { searchMovies } from "@/lib/tmdb";

export const dynamic = "force-dynamic";

/** GET /api/admin/tmdb/search?q=die hard&year=1988 */
export async function GET(req: Request) {
  return handle(async () => {
    await requireAdmin();
    const p = new URL(req.url).searchParams;
    const q = (p.get("q") || "").trim();
    if (!q) return [];
    const year = Number(p.get("year")) || undefined;
    return (await searchMovies(q, year)).slice(0, 10);
  });
}
