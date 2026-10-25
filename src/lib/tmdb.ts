import { env } from "@/lib/env";

/** Minimal TMDB client. Uses the v4 "API Read Access Token" as a Bearer token against the v3 endpoints. */
const BASE = "https://api.themoviedb.org/3";
export const TMDB_IMAGE = "https://image.tmdb.org/t/p/w500";
export const TMDB_ATTRIBUTION = "Poster via TMDB. This product uses the TMDB API but is not endorsed or certified by TMDB.";

async function tmdb<T>(path: string, params: Record<string, string | number | undefined> = {}): Promise<T> {
  const url = new URL(BASE + path);
  Object.entries(params).forEach(([k, v]) => v !== undefined && v !== "" && url.searchParams.set(k, String(v)));
  url.searchParams.set("language", "en-US");
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${env.tmdbToken()}`, Accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`TMDB ${path} failed: ${res.status} ${await res.text().catch(() => "")}`);
  return (await res.json()) as T;
}

interface TmdbMovieLite {
  id: number;
  title: string;
  release_date?: string;
  poster_path?: string | null;
  popularity?: number;
  overview?: string;
}
interface TmdbMovie extends TmdbMovieLite {
  genres: { id: number; name: string }[];
}

export interface FilmCandidate {
  tmdbId: number;
  title: string;
  year: number | null;
  posterUrl: string | null;
  popularity: number;
  overview: string;
}

function toCandidate(m: TmdbMovieLite): FilmCandidate {
  return {
    tmdbId: m.id,
    title: m.title,
    year: m.release_date ? Number(m.release_date.slice(0, 4)) : null,
    posterUrl: m.poster_path ? TMDB_IMAGE + m.poster_path : null,
    popularity: m.popularity ?? 0,
    overview: m.overview ?? "",
  };
}

export async function searchMovies(query: string, year?: number): Promise<FilmCandidate[]> {
  const data = await tmdb<{ results: TmdbMovieLite[] }>("/search/movie", { query, year, include_adult: "false" });
  return data.results.map(toCandidate);
}

export async function getMovie(tmdbId: number): Promise<FilmCandidate & { genres: string[] }> {
  const m = await tmdb<TmdbMovie>(`/movie/${tmdbId}`);
  return { ...toCandidate(m), genres: m.genres.map((g) => g.name) };
}

/** Well-known films to widen the guess list, so autocomplete never hints at the answer. */
export async function popularMovies(list: "top_rated" | "popular", page: number): Promise<FilmCandidate[]> {
  const data = await tmdb<{ results: TmdbMovieLite[] }>(`/movie/${list}`, { page });
  return data.results.map(toCandidate);
}
