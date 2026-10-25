"use client";

import { useEffect, useState } from "react";
import { CLUE_LABELS, formatCaseDate } from "@/lib/game";
import SignIn from "@/components/SignIn";

interface Candidate {
  tmdbId: number;
  title: string;
  year: number | null;
  posterUrl: string | null;
  overview: string;
}
interface ScheduleRow {
  puzzle_number: number;
  publish_date: string;
  state: string;
  films: { title: string; release_year: number; poster_url: string | null; tmdb_id: number | null };
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers || {}) } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || data.error || `Request failed (${res.status})`);
  return data as T;
}

export default function AdminPanel() {
  const [me, setMe] = useState<{ email: string | null; isAdmin: boolean } | null>(null);
  const [schedule, setSchedule] = useState<{ puzzles: ScheduleRow[]; nextDate: string; nextNumber: number } | null>(null);
  const [q, setQ] = useState("");
  const [year, setYear] = useState("");
  const [results, setResults] = useState<Candidate[]>([]);
  const [picked, setPicked] = useState<Candidate | null>(null);
  const [aliases, setAliases] = useState("");
  const [clues, setClues] = useState(["", "", "", "", ""]);
  const [date, setDate] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const loadSchedule = () =>
    api<{ puzzles: ScheduleRow[]; nextDate: string; nextNumber: number }>("/api/admin/puzzles")
      .then((s) => {
        setSchedule(s);
        setDate((d) => d || s.nextDate);
      })
      .catch((e) => setMsg(e.message));

  useEffect(() => {
    api<{ email: string | null; isAdmin: boolean }>("/api/me").then((m) => {
      setMe(m);
      if (m.isAdmin) loadSchedule();
    });
  }, []);

  async function run(label: string, fn: () => Promise<string>) {
    setBusy(true);
    setMsg(label);
    try {
      setMsg(await fn());
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!me) return <main className="admin"><p>Loading…</p></main>;
  if (!me.email)
    return (
      <main className="admin">
        <h1>Case desk</h1>
        <p>Sign in with an admin email to schedule cases.</p>
        <SignIn next="/admin" />
      </main>
    );
  if (!me.isAdmin)
    return (
      <main className="admin">
        <h1>Case desk</h1>
        <p>{me.email} is not on the admin list. Add it to ADMIN_EMAILS and redeploy.</p>
      </main>
    );

  return (
    <main className="admin">
      <header className="admin-head">
        <div className="badge">VILE!</div>
        <h1>Case desk</h1>
        <p className="note">Signed in as {me.email}</p>
      </header>

      {msg && <p className="admin-msg" role="status">{msg}</p>}

      <section className="admin-card">
        <h2>1. Find the film on TMDB</h2>
        <form
          className="admin-row"
          onSubmit={(e) => {
            e.preventDefault();
            run("Searching TMDB…", async () => {
              const r = await api<Candidate[]>(`/api/admin/tmdb/search?q=${encodeURIComponent(q)}&year=${encodeURIComponent(year)}`);
              setResults(r);
              return r.length ? `${r.length} matches.` : "No matches. Try another spelling.";
            });
          }}
        >
          <label>Title<input id="adm-q" value={q} onChange={(e) => setQ(e.target.value)} required /></label>
          <label>Year<input id="adm-year" value={year} onChange={(e) => setYear(e.target.value)} inputMode="numeric" size={6} /></label>
          <button disabled={busy}>Search</button>
        </form>
        <ul className="admin-results">
          {results.map((r) => (
            <li key={r.tmdbId}>
              <button
                type="button"
                className={picked?.tmdbId === r.tmdbId ? "on" : ""}
                onClick={() => setPicked(r)}
              >
                {r.posterUrl ? <img src={r.posterUrl} alt="" width={46} height={69} /> : <span className="ph" />}
                <span>
                  <b>{r.title}</b> ({r.year ?? "?"})
                  <small>{r.overview.slice(0, 140)}</small>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="admin-card">
        <h2>2. Write the five clues</h2>
        <p className="note">Picked: {picked ? `${picked.title} (${picked.year})` : "nothing yet"}</p>
        <label>
          Other accepted titles, comma-separated
          <input id="adm-aliases" value={aliases} onChange={(e) => setAliases(e.target.value)} placeholder="e.g. A New Hope, Star Wars Episode IV" />
        </label>
        {CLUE_LABELS.map((label, i) => (
          <label key={label}>
            {i + 1}. {label}
            <textarea
              id={`adm-clue-${i}`}
              rows={i === 0 ? 3 : 2}
              value={clues[i]}
              onChange={(e) => setClues((c) => c.map((x, j) => (j === i ? e.target.value : x)))}
            />
          </label>
        ))}
        <label>
          Date it goes live
          <input id="adm-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <button
          disabled={busy || !picked}
          onClick={() =>
            run("Saving case…", async () => {
              const { filmId } = await api<{ filmId: number }>("/api/admin/films/import", {
                method: "POST",
                body: JSON.stringify({ tmdbId: picked!.tmdbId, aliases: aliases.split(",") }),
              });
              const res = await api<{ puzzleNumber: number; publishDate: string }>("/api/admin/puzzles", {
                method: "POST",
                body: JSON.stringify({ filmId, clues, publishDate: date }),
              });
              setPicked(null);
              setResults([]);
              setClues(["", "", "", "", ""]);
              setAliases("");
              setDate("");
              await loadSchedule();
              return `Saved case #${res.puzzleNumber} for ${formatCaseDate(res.publishDate)}.`;
            })
          }
        >
          Schedule case
        </button>
      </section>

      <section className="admin-card">
        <h2>Tools</h2>
        <div className="admin-row">
          <button
            disabled={busy}
            onClick={() =>
              run("Matching scheduled films on TMDB…", async () => {
                const r = await api<{ matched: string[]; unmatched: string[] }>("/api/admin/films/enrich", { method: "POST" });
                await loadSchedule();
                return `Posters saved for ${r.matched.length} films.${r.unmatched.length ? ` Not found: ${r.unmatched.join(", ")}.` : ""}`;
              })
            }
          >
            Fetch posters for scheduled films
          </button>
          <button
            disabled={busy}
            onClick={() =>
              run("Adding popular films to the guess list…", async () => {
                const r = await api<{ saved: number }>("/api/admin/films/popular", { method: "POST", body: JSON.stringify({ pages: 3 }) });
                return `Saved ${r.saved} films to the guess list.`;
              })
            }
          >
            Add popular films to the guess list
          </button>
        </div>
      </section>

      <section className="admin-card">
        <h2>Schedule</h2>
        <p className="note">Next free date: {schedule ? formatCaseDate(schedule.nextDate) : "…"}</p>
        <div className="admin-table">
          <table>
            <thead>
              <tr><th>Case</th><th>Date</th><th>Film</th><th>Poster</th><th>State</th></tr>
            </thead>
            <tbody>
              {schedule?.puzzles.map((p) => (
                <tr key={p.puzzle_number}>
                  <td>#{p.puzzle_number}</td>
                  <td>{formatCaseDate(p.publish_date)}</td>
                  <td>{p.films.title} ({p.films.release_year})</td>
                  <td>{p.films.poster_url ? "Yes" : "No"}</td>
                  <td>{p.state}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
