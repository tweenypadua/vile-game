import { db } from "@/lib/supabase/server";
import { env } from "@/lib/env";
import {
  CLUE_LABELS,
  MAX_EXHIBITS,
  avgExhibits,
  caseNumberFor,
  computeStats,
  isCorrectGuess,
  normalizeTitle,
  winPct,
  type FinishedPlay,
  type GuessType,
  type PlayStatus,
} from "@/lib/game";

/* ---------- Types returned to the browser ---------- */

export interface ClueView {
  position: number;
  kind: string;
  label: string;
  body: string;
}
export interface StatsView {
  played: number;
  winPct: number;
  currentStreak: number;
  maxStreak: number;
  avgExhibits: string;
  solvedOnCounts: number[];
}
export interface PuzzleView {
  caseNumber: number;
  caseDate: string;
  status: PlayStatus;
  cluesShown: number;
  clues: ClueView[];
  guesses: { type: GuessType; text: string }[];
  solvedOn: number | null;
  reveal: { title: string; year: number; posterUrl: string | null; attribution: string | null } | null;
  stats: StatsView;
}

export class ApiError extends Error {
  constructor(public status: number, public code: string, message?: string) {
    super(message || code);
  }
}

/* ---------- Rows ---------- */

interface PuzzleRow {
  id: number;
  puzzle_number: number;
  publish_date: string;
  film_id: number;
  films: { title: string; release_year: number; poster_url: string | null; poster_attribution: string | null; film_aliases: { alias: string }[] };
  puzzle_clues: { position: number; kind: string; body: string }[];
}
interface PlayRow {
  id: number;
  player_id: string;
  user_id: string | null;
  puzzle_id: number;
  status: PlayStatus;
  clues_shown: number;
  solved_on: number | null;
}
interface GuessRow {
  attempt: number;
  is_skip: boolean;
  raw_text: string | null;
  is_correct: boolean;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function readPlayerId(req: Request): string {
  const id = req.headers.get("x-player-id") || "";
  if (!UUID.test(id)) throw new ApiError(400, "missing_player", "Send a device id in the X-Player-Id header.");
  return id.toLowerCase();
}

/* ---------- Players ---------- */

export async function touchPlayer(playerId: string): Promise<{ id: string; user_id: string | null }> {
  const { data, error } = await db()
    .from("players")
    .upsert({ id: playerId, last_seen_at: new Date().toISOString() }, { onConflict: "id" })
    .select("id, user_id")
    .single();
  if (error) throw error;
  return data as { id: string; user_id: string | null };
}

function ownerKey(player: { id: string; user_id: string | null }) {
  return player.user_id ? `user:${player.user_id}` : `player:${player.id}`;
}

/* ---------- Puzzles ---------- */

const PUZZLE_SELECT =
  "id, puzzle_number, publish_date, film_id, films(title, release_year, poster_url, poster_attribution, film_aliases(alias)), puzzle_clues(position, kind, body)";

export async function puzzleByDate(date: string): Promise<PuzzleRow> {
  const { data, error } = await db()
    .from("puzzles")
    .select(PUZZLE_SELECT)
    .eq("publish_date", date)
    .in("state", ["scheduled", "live"])
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new ApiError(404, "no_case_today", "No case is scheduled for today.");
  return data as unknown as PuzzleRow;
}

export async function puzzleByNumber(n: number): Promise<PuzzleRow> {
  const { data, error } = await db().from("puzzles").select(PUZZLE_SELECT).eq("puzzle_number", n).maybeSingle();
  if (error) throw error;
  if (!data) throw new ApiError(404, "no_such_case");
  return data as unknown as PuzzleRow;
}

/* ---------- Plays ---------- */

async function getOrCreatePlay(player: { id: string; user_id: string | null }, puzzleId: number): Promise<PlayRow> {
  const client = db();
  const existing = await client.from("plays").select("*").eq("player_id", player.id).eq("puzzle_id", puzzleId).maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data) return existing.data as PlayRow;

  // A signed-in user who already played this case on another device continues that play.
  if (player.user_id) {
    const other = await client
      .from("plays")
      .select("*")
      .eq("user_id", player.user_id)
      .eq("puzzle_id", puzzleId)
      .order("finished_at", { ascending: true, nullsFirst: false })
      .limit(1)
      .maybeSingle();
    if (other.error) throw other.error;
    if (other.data) return other.data as PlayRow;
  }

  const created = await client
    .from("plays")
    .upsert({ player_id: player.id, user_id: player.user_id, puzzle_id: puzzleId }, { onConflict: "player_id,puzzle_id", ignoreDuplicates: false })
    .select("*")
    .single();
  if (created.error) throw created.error;
  return created.data as PlayRow;
}

async function guessesFor(playId: number): Promise<GuessRow[]> {
  const { data, error } = await db().from("guesses").select("attempt, is_skip, raw_text, is_correct").eq("play_id", playId).order("attempt");
  if (error) throw error;
  return (data || []) as GuessRow[];
}

/* ---------- Stats ---------- */

export async function refreshStats(player: { id: string; user_id: string | null }, todayPuzzle: number): Promise<StatsView> {
  const client = db();
  let query = client.from("plays").select("status, solved_on, finished_at, puzzles(puzzle_number)").neq("status", "in_progress");
  query = player.user_id ? query.eq("user_id", player.user_id) : query.eq("player_id", player.id);
  const { data, error } = await query.order("finished_at", { ascending: true });
  if (error) throw error;

  const plays: FinishedPlay[] = (data || []).map((r: any) => ({
    puzzleNumber: r.puzzles.puzzle_number,
    status: r.status,
    solvedOn: r.solved_on,
  }));
  const s = computeStats(plays, todayPuzzle);
  const up = await client.from("player_stats").upsert({
    owner_key: ownerKey(player),
    played: s.played,
    wins: s.wins,
    current_streak: s.currentStreak,
    max_streak: s.maxStreak,
    last_won_puzzle: s.lastWonPuzzle,
    last_played_puzzle: s.lastPlayedPuzzle,
    solved_on_counts: s.solvedOnCounts,
    updated_at: new Date().toISOString(),
  });
  if (up.error) throw up.error;
  return {
    played: s.played,
    winPct: winPct(s),
    currentStreak: s.currentStreak,
    maxStreak: s.maxStreak,
    avgExhibits: avgExhibits(s.solvedOnCounts),
    solvedOnCounts: s.solvedOnCounts,
  };
}

/* ---------- The view a player is allowed to see ---------- */

function view(puzzle: PuzzleRow, play: PlayRow, guesses: GuessRow[], stats: StatsView): PuzzleView {
  const finished = play.status !== "in_progress";
  const shown = finished ? MAX_EXHIBITS : play.clues_shown;
  const clues = [...puzzle.puzzle_clues]
    .sort((a, b) => a.position - b.position)
    .filter((c) => c.position <= shown)
    .map((c) => ({ position: c.position, kind: c.kind, label: CLUE_LABELS[c.position - 1], body: c.body }));
  return {
    caseNumber: puzzle.puzzle_number,
    caseDate: puzzle.publish_date,
    status: play.status,
    cluesShown: shown,
    clues,
    guesses: guesses.map((g) => ({ type: g.is_correct ? "right" : g.is_skip ? "skip" : "wrong", text: g.raw_text || "" })),
    solvedOn: play.solved_on,
    reveal: finished
      ? { title: puzzle.films.title, year: puzzle.films.release_year, posterUrl: puzzle.films.poster_url, attribution: puzzle.films.poster_attribution }
      : null,
    stats,
  };
}

/* ---------- Actions ---------- */

export async function loadToday(playerId: string, localDate: string): Promise<PuzzleView> {
  const player = await touchPlayer(playerId);
  const puzzle = await puzzleByDate(localDate);
  const play = await getOrCreatePlay(player, puzzle.id);
  const [guesses, stats] = await Promise.all([guessesFor(play.id), refreshStats(player, puzzle.puzzle_number)]);
  return view(puzzle, play, guesses, stats);
}

export async function act(
  playerId: string,
  caseNumber: number,
  localDate: string,
  action: { kind: "guess"; text: string; filmId?: number } | { kind: "skip" },
): Promise<PuzzleView> {
  const player = await touchPlayer(playerId);
  const puzzle = await puzzleByDate(localDate);
  if (puzzle.puzzle_number !== caseNumber) throw new ApiError(400, "wrong_day", "That case is not open today.");
  const play = await getOrCreatePlay(player, puzzle.id);
  if (play.status !== "in_progress") throw new ApiError(409, "already_finished", "This case is already closed.");

  const previous = await guessesFor(play.id);
  const attempt = previous.length + 1;
  if (attempt > MAX_EXHIBITS) throw new ApiError(409, "already_finished");

  let correct = false;
  let raw: string | null = null;
  let matchedFilm: number | null = null;
  if (action.kind === "guess") {
    raw = action.text.trim().slice(0, 200);
    if (!raw) throw new ApiError(400, "empty_guess", "Type a film title first.");
    if (previous.some((g) => g.raw_text && normalizeTitle(g.raw_text) === normalizeTitle(raw!))) {
      throw new ApiError(400, "duplicate_guess", "You already tried that one.");
    }
    const aliases = puzzle.films.film_aliases.map((a) => a.alias);
    correct = action.filmId ? action.filmId === puzzle.film_id : isCorrectGuess(raw, puzzle.films.title, aliases);
    matchedFilm = action.filmId ?? null;
  }

  const ins = await db().from("guesses").insert({
    play_id: play.id,
    attempt,
    is_skip: action.kind === "skip",
    raw_text: raw,
    matched_film_id: matchedFilm,
    is_correct: correct,
  });
  if (ins.error) {
    if (ins.error.code === "23505") throw new ApiError(409, "conflict", "That guess was already counted. Refresh to continue.");
    throw ins.error;
  }

  const update: Partial<PlayRow> & { finished_at?: string } = {};
  if (correct) {
    update.status = "won";
    update.solved_on = attempt;
    update.finished_at = new Date().toISOString();
  } else if (attempt >= MAX_EXHIBITS) {
    update.status = "lost";
    update.finished_at = new Date().toISOString();
  } else {
    update.clues_shown = attempt + 1;
  }
  const upd = await db().from("plays").update(update).eq("id", play.id).select("*").single();
  if (upd.error) throw upd.error;

  const [guesses, stats] = await Promise.all([guessesFor(play.id), refreshStats(player, puzzle.puzzle_number)]);
  return view(puzzle, upd.data as PlayRow, guesses, stats);
}

/** Today's case number on the server's calendar (UTC), used by the cron job and admin. */
export function serverCaseNumber(now = new Date()): number {
  return caseNumberFor(now.toISOString().slice(0, 10), env.launchDate());
}

/** Attach this device (and its plays) to a signed-in user, then rebuild their combined stats. */
export async function linkPlayerToUser(playerId: string, userId: string, localDate: string): Promise<StatsView> {
  const client = db();
  const p = await client.from("players").upsert({ id: playerId, user_id: userId, last_seen_at: new Date().toISOString() }).select("id, user_id").single();
  if (p.error) throw p.error;
  const plays = await client.from("plays").update({ user_id: userId }).eq("player_id", playerId);
  if (plays.error) throw plays.error;
  return refreshStats({ id: playerId, user_id: userId }, caseNumberFor(localDate, env.launchDate()));
}
