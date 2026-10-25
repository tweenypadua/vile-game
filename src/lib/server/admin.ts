import { getUser, db } from "@/lib/supabase/server";
import { env } from "@/lib/env";
import { ApiError } from "@/lib/server/game-service";
import { normalizeTitle } from "@/lib/game";
import { TMDB_ATTRIBUTION, getMovie, type FilmCandidate } from "@/lib/tmdb";

/** Throws unless the signed-in user's email is listed in ADMIN_EMAILS. */
export async function requireAdmin() {
  const user = await getUser();
  if (!user) throw new ApiError(401, "signed_out", "Sign in with an admin email first.");
  if (!env.adminEmails().includes((user.email || "").toLowerCase())) throw new ApiError(403, "not_admin", "This account is not an admin.");
  return user;
}

/**
 * Saves a TMDB film into `films`. If a film with the same title and year already exists
 * (for example from the seed data), that row gets the TMDB id and poster instead of a duplicate.
 */
export async function upsertFilmFromTmdb(c: FilmCandidate & { genres?: string[] }): Promise<number> {
  if (!c.year) throw new ApiError(400, "no_year", "TMDB has no release year for this film.");
  const client = db();
  const row = {
    tmdb_id: c.tmdbId,
    title: c.title,
    title_normalized: normalizeTitle(c.title),
    release_year: c.year,
    genres: c.genres ?? [],
    poster_url: c.posterUrl,
    poster_attribution: c.posterUrl ? TMDB_ATTRIBUTION : null,
    popularity: Math.min(1000, c.popularity),
  };

  const byTmdb = await client.from("films").select("id").eq("tmdb_id", c.tmdbId).maybeSingle();
  const byTitle = byTmdb.data
    ? null
    : await client.from("films").select("id").eq("title_normalized", row.title_normalized).eq("release_year", c.year).maybeSingle();
  const existingId = (byTmdb.data?.id ?? byTitle?.data?.id) as number | undefined;

  if (existingId) {
    const { error } = await client.from("films").update(row).eq("id", existingId);
    if (error) throw error;
    return existingId;
  }
  const { data, error } = await client.from("films").insert(row).select("id").single();
  if (error) throw error;
  return data.id as number;
}

export async function importFilm(tmdbId: number, aliases: string[] = []): Promise<number> {
  const movie = await getMovie(tmdbId);
  const id = await upsertFilmFromTmdb(movie);
  const clean = aliases.map((a) => a.trim()).filter(Boolean);
  if (clean.length) {
    const { error } = await db()
      .from("film_aliases")
      .upsert(
        clean.map((a) => ({ film_id: id, alias: a, alias_normalized: normalizeTitle(a) })),
        { onConflict: "film_id,alias_normalized", ignoreDuplicates: true },
      );
    if (error) throw error;
  }
  return id;
}
