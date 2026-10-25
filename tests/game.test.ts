import { describe, expect, it } from "vitest";
import {
  avgExhibits,
  caseNumberFor,
  computeStats,
  dateForCase,
  decodeSquares,
  encodeSquares,
  formatCaseDate,
  isCorrectGuess,
  isPlausibleLocalDate,
  normalizeTitle,
  shareText,
  squaresFor,
} from "../src/lib/game";

describe("normalizeTitle", () => {
  it("drops articles, punctuation, accents and a trailing year", () => {
    expect(normalizeTitle("The Lion King")).toBe("lion king");
    expect(normalizeTitle("  the LION king (1994) ")).toBe("lion king");
    expect(normalizeTitle("Amélie")).toBe("amelie");
    expect(normalizeTitle("Willy Wonka & the Chocolate Factory")).toBe("willy wonka and the chocolate factory");
  });
});

describe("isCorrectGuess", () => {
  it("accepts the title and its aliases, ignoring case", () => {
    expect(isCorrectGuess("home alone", "Home Alone", [])).toBe(true);
    expect(isCorrectGuess("101 dalmatians", "One Hundred and One Dalmatians", ["101 Dalmatians"])).toBe(true);
    expect(isCorrectGuess("Home Alone 2", "Home Alone", [])).toBe(false);
    expect(isCorrectGuess("", "Home Alone", [])).toBe(false);
  });
});

describe("dates", () => {
  it("numbers cases from the launch date", () => {
    expect(caseNumberFor("2026-10-24", "2026-10-24")).toBe(1);
    expect(caseNumberFor("2026-10-25", "2026-10-24")).toBe(2);
    expect(caseNumberFor("2026-11-22", "2026-10-24")).toBe(30);
    expect(dateForCase(2, "2026-10-24")).toBe("2026-10-25");
    expect(formatCaseDate("2026-10-25")).toBe("25 Oct 2026");
  });
  it("accepts any date that is today in some time zone", () => {
    const now = new Date("2026-10-25T13:00:00Z");
    expect(isPlausibleLocalDate("2026-10-25", now)).toBe(true);
    expect(isPlausibleLocalDate("2026-10-24", now)).toBe(false);
    expect(isPlausibleLocalDate("2026-10-27", now)).toBe(false);
    const late = new Date("2026-10-25T22:00:00Z");
    expect(isPlausibleLocalDate("2026-10-26", late)).toBe(true);
    expect(isPlausibleLocalDate("bad", now)).toBe(false);
  });
});

describe("computeStats", () => {
  it("counts streaks across consecutive wins and breaks them on a loss", () => {
    const s = computeStats(
      [
        { puzzleNumber: 1, status: "won", solvedOn: 2 },
        { puzzleNumber: 2, status: "won", solvedOn: 1 },
        { puzzleNumber: 3, status: "lost", solvedOn: null },
        { puzzleNumber: 4, status: "won", solvedOn: 3 },
        { puzzleNumber: 5, status: "won", solvedOn: 2 },
      ],
      5,
    );
    expect(s.played).toBe(5);
    expect(s.wins).toBe(4);
    expect(s.currentStreak).toBe(2);
    expect(s.maxStreak).toBe(2);
    expect(s.solvedOnCounts).toEqual([1, 2, 1, 0, 0]);
  });
  it("breaks the streak after a missed day", () => {
    const s = computeStats([{ puzzleNumber: 1, status: "won", solvedOn: 1 }], 3);
    expect(s.currentStreak).toBe(0);
    expect(s.maxStreak).toBe(1);
  });
  it("keeps the streak alive until today's case is played", () => {
    const s = computeStats([{ puzzleNumber: 4, status: "won", solvedOn: 1 }], 5);
    expect(s.currentStreak).toBe(1);
  });
  it("counts a puzzle once when two devices played it", () => {
    const s = computeStats(
      [
        { puzzleNumber: 1, status: "won", solvedOn: 1 },
        { puzzleNumber: 1, status: "lost", solvedOn: null },
      ],
      1,
    );
    expect(s.played).toBe(1);
    expect(s.wins).toBe(1);
  });
});

describe("sharing", () => {
  it("builds squares and the copy-paste text", () => {
    const sq = squaresFor([{ type: "wrong" }, { type: "right" }]);
    expect(sq).toEqual(["wrong", "right", "none", "none", "none"]);
    expect(encodeSquares(sq)).toBe("wrnnn");
    expect(decodeSquares("wrnnn")).toEqual(sq);
    expect(decodeSquares("xx")).toBeNull();
    const text = shareText({
      caseNumber: 2,
      caseDate: "2026-10-25",
      squares: sq,
      won: true,
      solvedOn: 2,
      streak: 3,
      avg: avgExhibits([1, 2, 1, 0, 0]),
      url: "https://vile.example.com",
    });
    expect(text).toBe(
      "VILE! Case #2 · 25 Oct 2026\n🟥🟨⬛⬛⬛ Convicted on exhibit 2/5\n🔥 Streak: 3 · Avg. exhibits: 2.0\nhttps://vile.example.com",
    );
  });
});
