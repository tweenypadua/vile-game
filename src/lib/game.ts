/** Pure game rules shared by the API and the browser. No I/O here, so it is unit-tested. */

export const MAX_EXHIBITS = 5;

export const CLUE_LABELS = ["The defense", "The accused", "Prosecution objects", "Genre and year", "The plain facts"] as const;

export type GuessType = "wrong" | "skip" | "right";
export type Square = "none" | "wrong" | "right";
export type PlayStatus = "in_progress" | "won" | "lost";

/** Lowercase, no accents or punctuation, "&" read as "and", trailing year and leading article dropped. */
export function normalizeTitle(s: string): string {
  return String(s)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/ (19|20)\d\d$/, "")
    .replace(/^(the|a|an) /, "");
}

export function isCorrectGuess(guess: string, title: string, aliases: string[]): boolean {
  const g = normalizeTitle(guess);
  if (!g) return false;
  return [title, ...aliases].some((t) => normalizeTitle(t) === g);
}

/** Days are counted on the player's own calendar: "YYYY-MM-DD" strings, compared as UTC dates. */
export function dayIndex(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 864e5);
}

export function caseNumberFor(dateStr: string, launchDate: string): number {
  return dayIndex(dateStr) - dayIndex(launchDate) + 1;
}

export function dateForCase(caseNumber: number, launchDate: string): string {
  return new Date((dayIndex(launchDate) + caseNumber - 1) * 864e5).toISOString().slice(0, 10);
}

/** "25 Oct 2026" */
export function formatCaseDate(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** True when the date the browser sent is today somewhere on Earth (UTC-12 to UTC+14). */
export function isPlausibleLocalDate(dateStr: string, now = new Date()): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
  const earliest = new Date(now.getTime() - 12 * 3600e3).toISOString().slice(0, 10);
  const latest = new Date(now.getTime() + 14 * 3600e3).toISOString().slice(0, 10);
  return dateStr >= earliest && dateStr <= latest;
}

export function squaresFor(guesses: { type: GuessType }[]): Square[] {
  return Array.from({ length: MAX_EXHIBITS }, (_, i) => {
    const g = guesses[i];
    return !g ? "none" : g.type === "right" ? "right" : "wrong";
  });
}

export interface FinishedPlay {
  puzzleNumber: number;
  status: "won" | "lost";
  solvedOn: number | null;
}

export interface Stats {
  played: number;
  wins: number;
  currentStreak: number;
  maxStreak: number;
  lastWonPuzzle: number | null;
  lastPlayedPuzzle: number | null;
  solvedOnCounts: number[];
}

/**
 * Rebuilds stats from finished plays. A win keeps the streak going only if the previous
 * puzzle was also won; a loss or a missed day breaks it. If the same puzzle appears twice
 * (two devices merged on sign-in), the first finished one counts.
 */
export function computeStats(plays: FinishedPlay[], todayPuzzle: number): Stats {
  const byPuzzle = new Map<number, FinishedPlay>();
  for (const p of plays) if (!byPuzzle.has(p.puzzleNumber)) byPuzzle.set(p.puzzleNumber, p);
  const sorted = Array.from(byPuzzle.values()).sort((a, b) => a.puzzleNumber - b.puzzleNumber);

  const s: Stats = {
    played: 0,
    wins: 0,
    currentStreak: 0,
    maxStreak: 0,
    lastWonPuzzle: null,
    lastPlayedPuzzle: null,
    solvedOnCounts: [0, 0, 0, 0, 0],
  };
  for (const p of sorted) {
    s.played++;
    s.lastPlayedPuzzle = p.puzzleNumber;
    if (p.status === "won") {
      s.wins++;
      if (p.solvedOn && p.solvedOn >= 1 && p.solvedOn <= 5) s.solvedOnCounts[p.solvedOn - 1]++;
      s.currentStreak = s.lastWonPuzzle === p.puzzleNumber - 1 ? s.currentStreak + 1 : 1;
      s.lastWonPuzzle = p.puzzleNumber;
      s.maxStreak = Math.max(s.maxStreak, s.currentStreak);
    } else {
      s.currentStreak = 0;
    }
  }
  // A streak is still alive only if the last win was today or yesterday.
  if (s.lastWonPuzzle === null || s.lastWonPuzzle < todayPuzzle - 1) s.currentStreak = 0;
  return s;
}

export function winPct(s: Pick<Stats, "played" | "wins">): number {
  return s.played ? Math.round((s.wins / s.played) * 100) : 0;
}

/** Average exhibit a case was solved on, counting wins only. "-" before the first win. */
export function avgExhibits(counts: number[]): string {
  let n = 0;
  let sum = 0;
  counts.forEach((v, i) => {
    n += v;
    sum += v * (i + 1);
  });
  return n ? (sum / n).toFixed(1) : "-";
}

const EMOJI: Record<Square, string> = { none: "⬛", right: "🟨", wrong: "🟥" };

export function shareText(opts: {
  caseNumber: number;
  caseDate: string;
  squares: Square[];
  won: boolean;
  solvedOn: number | null;
  streak: number;
  avg: string;
  url: string;
}): string {
  const line = opts.squares.map((s) => EMOJI[s]).join("");
  return [
    `VILE! Case #${opts.caseNumber} · ${formatCaseDate(opts.caseDate)}`,
    `${line} ${opts.won ? `Convicted on exhibit ${opts.solvedOn}/5` : "Villain acquitted"}`,
    `🔥 Streak: ${opts.streak} · Avg. exhibits: ${opts.avg}`,
    opts.url,
  ].join("\n");
}

/** Encodes squares for the Story image URL: w = wrong, r = right, n = none. */
export function encodeSquares(sq: Square[]): string {
  return sq.map((s) => (s === "right" ? "r" : s === "wrong" ? "w" : "n")).join("");
}

export function decodeSquares(code: string): Square[] | null {
  if (!/^[wrn]{5}$/.test(code)) return null;
  return code.split("").map((c) => (c === "r" ? "right" : c === "w" ? "wrong" : "none"));
}
