"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PuzzleView, StatsView } from "@/lib/server/game-service";
import { CLUE_LABELS, MAX_EXHIBITS, encodeSquares, formatCaseDate, shareText, squaresFor } from "@/lib/game";
import { ApiFailure, api, loadLocal, localDate, saveLocal, untilMidnight, type LocalState } from "@/lib/client";
import { supabaseBrowser } from "@/lib/supabase/browser";
import Dialog, { CloseButton } from "@/components/Dialog";
import SignIn from "@/components/SignIn";

const ROT = [-1.2, 2.4, -2, -3.5, 1.6];
const SIDE = ["", "right", "", "", "right"];
type Suggestion = { id: number; title: string; year: number };
type Panel = "none" | "verdict" | "stats" | "help" | "story";

function siteUrl() {
  return (process.env.NEXT_PUBLIC_SITE_URL || (typeof window !== "undefined" ? window.location.origin : "")).replace(/\/$/, "");
}

export default function Game() {
  const [local, setLocal] = useState<LocalState | null>(null);
  const [view, setView] = useState<PuzzleView | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [panel, setPanel] = useState<Panel>("none");
  const [email, setEmail] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [fresh, setFresh] = useState(-1);
  const [toast, setToast] = useState("");
  const [text, setText] = useState("");
  const [picked, setPicked] = useState<Suggestion | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [active, setActive] = useState(-1);
  const [copyFallback, setCopyFallback] = useState("");
  const [storyUrl, setStoryUrl] = useState("");
  const [, setTick] = useState(0);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>();
  const day = useRef(localDate());

  const say = useCallback((msg: string) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 2400);
  }, []);

  const loadToday = useCallback(async (playerId: string) => {
    try {
      setProblem(null);
      const v = await api<PuzzleView>(`/api/puzzle/today?date=${localDate()}`, playerId);
      setView(v);
      setFresh(-1);
    } catch (e) {
      setProblem(e instanceof ApiFailure ? e.message : "Couldn't reach the courtroom. Check your connection.");
    }
  }, []);

  /* Start-up: device id, sign-in state, today's case. */
  useEffect(() => {
    const l = loadLocal();
    setLocal(l);
    (async () => {
      const params = new URLSearchParams(window.location.search);
      if (params.has("signedin") || params.has("signin")) {
        if (params.has("signedin")) {
          try {
            await api("/api/auth/link", l.playerId, { date: localDate() });
            say("Signed in. Your record now follows you to any device.");
          } catch (e) {
            say((e as Error).message);
          }
        } else say("Sign-in didn't finish. Try again.");
        window.history.replaceState(null, "", window.location.pathname);
      }
      fetch("/api/me").then((r) => r.json()).then((m) => setEmail(m.email ?? null)).catch(() => {});
      await loadToday(l.playerId);
    })();
    if (!l.seenHelp) setPanel("help");
  }, [loadToday, say]);

  /* Countdown, and a new case when the local date changes. */
  useEffect(() => {
    const t = setInterval(() => {
      setTick((n) => n + 1);
      const today = localDate();
      if (today !== day.current && local) {
        day.current = today;
        setPanel("none");
        loadToday(local.playerId);
      }
    }, 1000);
    return () => clearInterval(t);
  }, [local, loadToday]);

  /* Autocomplete: ask the server for matching titles as the player types. */
  useEffect(() => {
    if (!local || picked?.title === text) return;
    const q = text.trim();
    if (q.length < 2) {
      setSuggestions([]);
      return;
    }
    const handle = setTimeout(async () => {
      try {
        setSuggestions(await api<Suggestion[]>(`/api/films/search?q=${encodeURIComponent(q)}`, local.playerId));
        setActive(-1);
      } catch {
        setSuggestions([]);
      }
    }, 150);
    return () => clearTimeout(handle);
  }, [text, local, picked]);

  async function send(kind: "guess" | "skip") {
    if (!local || !view || busy) return;
    const guess = text.trim();
    if (kind === "guess" && !guess) return say("Type a film title first.");
    setBusy(true);
    try {
      const body = kind === "guess" ? { guess, filmId: picked?.title === guess ? picked.id : undefined, date: localDate() } : { date: localDate() };
      const next = await api<PuzzleView>(`/api/puzzle/${view.caseNumber}/${kind}`, local.playerId, body);
      setView(next);
      setText("");
      setPicked(null);
      setSuggestions([]);
      if (next.status !== "in_progress") {
        setFresh(-1);
        setTimeout(() => setPanel("verdict"), 650);
      } else {
        setFresh(next.cluesShown - 1);
        say(`${kind === "skip" ? "Skipped" : "Overruled"}. Exhibit ${next.cluesShown} is unsealed.`);
      }
    } catch (e) {
      const err = e as ApiFailure;
      say(err.message);
      if (err.code === "wrong_day" || err.code === "already_finished" || err.code === "conflict") loadToday(local.playerId);
    } finally {
      setBusy(false);
    }
  }

  function closeHelp() {
    setPanel("none");
    if (local && !local.seenHelp) {
      const l = { ...local, seenHelp: true };
      setLocal(l);
      saveLocal(l);
    }
  }

  /* ---------- Sharing ---------- */
  function resultText(v: PuzzleView) {
    return shareText({
      caseNumber: v.caseNumber,
      caseDate: v.caseDate,
      squares: squaresFor(v.guesses),
      won: v.status === "won",
      solvedOn: v.solvedOn,
      streak: v.stats.currentStreak,
      avg: v.stats.avgExhibits,
      url: siteUrl(),
    });
  }
  async function copyResult() {
    if (!view) return;
    const t = resultText(view);
    setCopyFallback("");
    try {
      await navigator.clipboard.writeText(t);
      say("Result copied. Paste it anywhere.");
    } catch {
      setCopyFallback(t);
    }
  }
  function storyImageUrl(v: PuzzleView) {
    const p = new URLSearchParams({
      c: String(v.caseNumber),
      d: v.caseDate,
      r: encodeSquares(squaresFor(v.guesses)),
      s: String(v.stats.currentStreak),
      a: v.stats.avgExhibits,
      w: String(v.stats.winPct),
    });
    return `/api/share/story?${p}`;
  }
  /**
   * Instagram on the web: hand the image to the phone's share sheet, where the player picks Instagram → Story.
   * No Facebook App ID is needed for this. Where file sharing isn't supported, show the image to save instead.
   */
  async function shareStory() {
    if (!view) return;
    const url = storyImageUrl(view);
    setStoryUrl(url);
    try {
      const blob = await (await fetch(url)).blob();
      const file = new File([blob], `vile-case-${view.caseNumber}.png`, { type: "image/png" });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: "VILE!", text: `VILE! Case #${view.caseNumber}` });
        return;
      }
    } catch (e) {
      if ((e as Error).name === "AbortError") return; // the player closed the share sheet
    }
    setPanel("story");
  }

  async function signOut() {
    await supabaseBrowser().auth.signOut();
    setEmail(null);
    if (local) {
      // A fresh device id, so the next person on this device starts their own record.
      const l = { ...local, playerId: crypto.randomUUID() };
      setLocal(l);
      saveLocal(l);
      loadToday(l.playerId);
    }
    say("Signed out.");
  }

  /* ---------- Render ---------- */
  const playing = view?.status === "in_progress";
  const shown = view?.cluesShown ?? 1;
  const wrongs = view ? view.guesses.filter((g) => g.type !== "right").length : 0;

  return (
    <>
      <main className="app">
        <div className="side">
          <div className="top">
            <div className="badge">VILE!</div>
            <div className="top-right">
              <div className="pips" role="img" aria-label={`Exhibit ${shown} of 5`}>
                {Array.from({ length: MAX_EXHIBITS }, (_, i) => (
                  <span key={i} className={`pip${i < shown ? " on" : ""}`} />
                ))}
              </div>
              <button className="icon-btn" aria-label="How to play" onClick={() => setPanel("help")}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="9.5" />
                  <path d="M9.3 9.2a2.8 2.8 0 0 1 5.4 1c0 1.9-2.7 2.4-2.7 4" />
                  <path d="M12 17.6v.1" />
                </svg>
              </button>
              <button className="icon-btn" aria-label="Your stats" onClick={() => setPanel("stats")} disabled={!view}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
                  <path d="M5 20V11M12 20V4M19 20v-6" />
                </svg>
              </button>
            </div>
          </div>

          <h1 className="exhibit">
            {!view ? "VILE!" : playing ? `EXHIBIT ${shown} OF 5` : view.status === "won" ? "CASE CLOSED" : "VILLAIN ACQUITTED"}
          </h1>
          {view && (
            <div className="case-no">
              DAILY CASE #{view.caseNumber} · {formatCaseDate(view.caseDate).toUpperCase()}
            </div>
          )}

          {view && (
            <div className="dock">
              <div className="band">
                <div className="dock-wrap">
                  <div>
                    <h2>{playing ? "NAME THE FILM." : view.status === "won" ? "GUILTY AS CHARGED." : "THE VILLAIN WALKS FREE."}</h2>
                    <div className="status">
                      {playing
                        ? shown === 5
                          ? "Last exhibit. One guess left."
                          : wrongs
                            ? `${5 - wrongs} guesses left. Each miss unseals a new exhibit.`
                            : "Every wrong guess unseals a new exhibit."
                        : `Next case in ${untilMidnight()}`}
                    </div>
                  </div>
                  {playing && (
                    <button className="band-btn" type="button" onClick={() => send("skip")} disabled={busy}>
                      SKIP
                    </button>
                  )}
                </div>
              </div>
              <div className="bar">
                <div className="dock-wrap">
                  {playing ? (
                    <>
                      {suggestions.length > 0 && (
                        <ul className="suggest" id="suggest" role="listbox">
                          {suggestions.map((s, i) => (
                            <li key={s.id}>
                              <button
                                type="button"
                                tabIndex={-1}
                                className={i === active ? "active" : ""}
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => {
                                  setPicked(s);
                                  setText(s.title);
                                  setSuggestions([]);
                                }}
                              >
                                {s.title}
                                <span>{s.year}</span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                      <form
                        className="guess-form"
                        autoComplete="off"
                        onSubmit={(e) => {
                          e.preventDefault();
                          send("guess");
                        }}
                      >
                        <label htmlFor="guess" className="sr">Your guess: a film title</label>
                        <input
                          id="guess"
                          type="text"
                          placeholder="Type a film title…"
                          role="combobox"
                          aria-expanded={suggestions.length > 0}
                          aria-controls="suggest"
                          aria-autocomplete="list"
                          enterKeyHint="send"
                          spellCheck={false}
                          value={text}
                          disabled={busy}
                          onChange={(e) => setText(e.target.value)}
                          onBlur={() => setTimeout(() => setSuggestions([]), 150)}
                          onKeyDown={(e) => {
                            if (!suggestions.length) return;
                            if (e.key === "ArrowDown") {
                              e.preventDefault();
                              setActive((a) => (a + 1) % suggestions.length);
                            } else if (e.key === "ArrowUp") {
                              e.preventDefault();
                              setActive((a) => (a - 1 + suggestions.length) % suggestions.length);
                            } else if (e.key === "Escape") setSuggestions([]);
                            else if (e.key === "Enter" && active >= 0) {
                              e.preventDefault();
                              const s = suggestions[active];
                              setPicked(s);
                              setText(s.title);
                              setSuggestions([]);
                            }
                          }}
                        />
                        <button className="go" type="submit" aria-label="Submit guess" disabled={busy}>
                          <svg viewBox="0 0 24 24" fill="none" stroke="#7a1424" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M5 12h14M13 6l6 6-6 6" />
                          </svg>
                        </button>
                      </form>
                    </>
                  ) : (
                    <div className="closed-actions">
                      <button type="button" className="btn-gold" onClick={() => setPanel("verdict")}>VERDICT</button>
                      <button type="button" className="btn-line" onClick={() => setPanel("stats")}>STATS</button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {view && (
            <div className="log" aria-label="Your guesses">
              {view.guesses
                .filter((g) => g.type !== "right")
                .map((g, i) =>
                  g.type === "skip" ? (
                    <span key={i} className="chip"><b>SKIPPED</b>Exhibit passed</span>
                  ) : (
                    <span key={i} className="chip"><b>OVERRULED</b><s>{g.text}</s></span>
                  ),
                )}
            </div>
          )}

          <p className="site-foot">
            Film data from <a href="https://www.themoviedb.org" target="_blank" rel="noopener noreferrer">TMDB</a>. This product uses the TMDB API but is not endorsed or certified by TMDB.
          </p>
        </div>

        <section className="board" aria-live="polite">
          {problem && (
            <div className="problem">
              <p>{problem}</p>
              <button className="btn-gold wide-btn" onClick={() => local && loadToday(local.playerId)}>TRY AGAIN</button>
            </div>
          )}
          {!view && !problem && <p className="loading">Bringing in the accused…</p>}
          {view &&
            Array.from({ length: MAX_EXHIBITS }, (_, i) => {
              const clue = view.clues.find((c) => c.position === i + 1);
              const style = { "--r": `${ROT[i]}deg` } as React.CSSProperties;
              if (!clue)
                return (
                  <article key={i} className={`clue ${SIDE[i]} sealed`} style={style} aria-label={`Exhibit ${i + 1} sealed`}>
                    <span className="label">Sealed · Exhibit {i + 1}</span>
                    <small>{CLUE_LABELS[i]}</small>
                  </article>
                );
              const cls = `clue ${SIDE[i]}${i === fresh ? " fresh" : ""}`;
              if (i === 0)
                return (
                  <article key={i} className={`${cls} c-defense`} style={style}>
                    <span className="label">{clue.label}</span>
                    <p>{clue.body}</p>
                  </article>
                );
              if (clue.kind === "genre_year")
                return (
                  <article key={i} className={`${cls} card c-genre_year`} style={style}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true">
                      <rect x="3" y="5" width="18" height="14" rx="1.5" />
                      <path d="M3 9h18M8 5l-2 4M13 5l-2 4M18 5l-2 4" />
                    </svg>
                    <div>
                      <span className="label">{clue.label}</span>
                      <span className="g">{clue.body}</span>
                    </div>
                  </article>
                );
              return (
                <article key={i} className={`${cls} card c-${clue.kind}`} style={style}>
                  <span className="label">{clue.label}</span>
                  <p>{clue.body}</p>
                </article>
              );
            })}
        </section>
      </main>

      {/* Verdict */}
      <Dialog open={panel === "verdict" && !!view?.reveal} onClose={() => setPanel("none")} labelledBy="verdict-stamp" className="verdict">
        {view?.reveal && (
          <>
            <div className={`stamp ${view.status === "won" ? "won" : "lost"}`} id="verdict-stamp">
              {view.status === "won" ? "GUILTY!" : "ACQUITTED!"}
            </div>
            {view.reveal.posterUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img className="poster" src={view.reveal.posterUrl} alt={`Poster for ${view.reveal.title}`} width={190} height={285} />
            ) : (
              <div className="evidence" aria-hidden="true">
                <div className="e-top">EVIDENCE · CASE #{view.caseNumber}</div>
                <div className="e-title">{view.reveal.title}</div>
                <div className="e-year">{view.reveal.year}</div>
              </div>
            )}
            {view.reveal.attribution && <div className="attribution">{view.reveal.attribution}</div>}
            <div>
              <div className="eyebrow">The film was</div>
              <div className="film-name">{view.reveal.title} ({view.reveal.year})</div>
            </div>
            <div className="hand-note">
              {view.status === "won" ? `Convicted on exhibit ${view.solvedOn} of 5` : "Out of exhibits. The villain walks free."}
            </div>
            <Squares view={view} />
            <Meta view={view} />
            <div className="actions">
              <button type="button" className="btn-gold" onClick={copyResult}>COPY RESULT</button>
              <button type="button" className="btn-maroon" onClick={shareStory}>SHARE TO STORY</button>
              <button type="button" className="btn-line wide" onClick={() => setPanel("stats")}>SEE YOUR STATS</button>
            </div>
            {copyFallback && <CopyFallback text={copyFallback} />}
            <div className="game-url">Play at <b>{siteUrl().replace(/^https?:\/\//, "")}</b></div>
            <div className="next-in">Next villain stands trial in <b>{untilMidnight()}</b></div>
            <button type="button" className="linkish" onClick={() => setPanel("none")}>Review the case</button>
          </>
        )}
      </Dialog>

      {/* Stats */}
      <Dialog open={panel === "stats" && !!view} onClose={() => setPanel("none")} labelledBy="stats-title">
        {view && (
          <>
            <div className="sheet-top">
              <div className="badge">VILE!</div>
              <CloseButton onClick={() => setPanel("none")} />
            </div>
            <div>
              <div className="eyebrow">Case file</div>
              <h2 id="stats-title">YOUR RECORD</h2>
            </div>
            <StatCard stats={view.stats} />
            <Distribution stats={view.stats} today={view.status === "won" ? view.solvedOn : null} />
            {!playing && (
              <div className="actions">
                <button type="button" className="btn-gold" onClick={copyResult}>COPY RESULT</button>
                <button type="button" className="btn-maroon" onClick={shareStory}>SHARE TO STORY</button>
              </div>
            )}
            {copyFallback && <CopyFallback text={copyFallback} />}
            <div className="next-in">Next villain stands trial in <b>{untilMidnight()}</b></div>
            <div className="account">
              {email ? (
                <>
                  <p className="note">Signed in as {email}. Your record follows you to any device.</p>
                  <button type="button" className="btn-line wide-btn" onClick={signOut}>SIGN OUT</button>
                </>
              ) : (
                <>
                  <p className="note">Your record is saved to this device. Sign in to keep your streak on any phone or computer.</p>
                  <SignIn />
                </>
              )}
            </div>
          </>
        )}
      </Dialog>

      {/* How to play */}
      <Dialog open={panel === "help"} onClose={closeHelp} labelledBy="help-title">
        <div className="sheet-top">
          <div className="badge">VILE!</div>
          <CloseButton onClick={closeHelp} />
        </div>
        <h2 id="help-title">HOW THE TRIAL WORKS</h2>
        <p className="lead-hand">Every day a film villain goes on trial. Their lawyer speaks first. Name the film to convict them.</p>
        <ol className="help-list">
          <li><div><b>The defense</b><span>The villain&apos;s lawyer pleads their case. The hardest clue.</span></div></li>
          <li><div><b>The accused</b><span>Who the villain is.</span></div></li>
          <li><div><b>Prosecution objects</b><span>What the villain really did.</span></div></li>
          <li><div><b>Genre and year</b><span>When and what kind of film.</span></div></li>
          <li><div><b>The plain facts</b><span>A one-line plot summary. The easiest clue.</span></div></li>
        </ol>
        <p className="note">
          Each wrong guess or skip unseals the next exhibit. Five exhibits, one verdict. A new villain stands trial every day at midnight, your time.
        </p>
        <div className="actions">
          <button type="button" className="btn-gold wide" onClick={closeHelp}>OPEN TODAY&apos;S CASE</button>
        </div>
      </Dialog>

      {/* Story image fallback (desktop and browsers without file sharing) */}
      <Dialog open={panel === "story"} onClose={() => setPanel("none")} labelledBy="story-title">
        <div className="sheet-top">
          <h2 id="story-title">YOUR STORY</h2>
          <CloseButton onClick={() => setPanel("none")} />
        </div>
        {storyUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="story-img" src={storyUrl} alt="Your VILE! result as an Instagram Story image" />
        )}
        <p className="note">
          Save the image, then open Instagram, start a Story and pick it from your photos. It never shows the film&apos;s title, so it won&apos;t spoil the case.
        </p>
        <div className="actions">
          <a className="btn-gold" href={storyUrl} download={view ? `vile-case-${view.caseNumber}.png` : "vile.png"}>SAVE IMAGE</a>
          <button type="button" className="btn-line" onClick={() => setPanel("none")}>DONE</button>
        </div>
      </Dialog>

      {toast && <div className="toast" role="status">{toast}</div>}
    </>
  );
}

function Squares({ view }: { view: PuzzleView }) {
  const sq = squaresFor(view.guesses);
  return (
    <div className="squares" role="img" aria-label={sq.map((s) => (s === "right" ? "solved" : s === "wrong" ? "wrong" : "unused")).join(", ")}>
      {sq.map((s, i) => (
        <span key={i} className={`sq ${s}`} />
      ))}
    </div>
  );
}

function Meta({ view }: { view: PuzzleView }) {
  return (
    <div className="meta">
      <div><span>CASE DATE</span><b>{formatCaseDate(view.caseDate)}</b></div>
      <div><span>STREAK</span><b>{view.stats.currentStreak}</b></div>
      <div><span>AVG. EXHIBITS</span><b>{view.stats.avgExhibits}</b></div>
    </div>
  );
}

function StatCard({ stats }: { stats: StatsView }) {
  return (
    <div className="stat-card">
      <div><strong>{stats.played}</strong><span>PLAYED</span></div>
      <div><strong>{stats.winPct}</strong><span>WIN %</span></div>
      <div><strong>{stats.currentStreak}</strong><span>STREAK</span></div>
      <div><strong>{stats.maxStreak}</strong><span>BEST</span></div>
      <div><strong>{stats.avgExhibits}</strong><span>AVG. EXHIBITS</span></div>
    </div>
  );
}

function Distribution({ stats, today }: { stats: StatsView; today: number | null }) {
  const max = Math.max(1, ...stats.solvedOnCounts);
  return (
    <div className="dist">
      <div className="eyebrow">Convicted on exhibit</div>
      {stats.solvedOnCounts.map((v, i) => (
        <div className="dist-row" key={i}>
          <span>{i + 1}</span>
          <div className={`dist-bar${today === i + 1 ? " today" : ""}`} style={{ width: `${Math.max(8, Math.round((v / max) * 100))}%` }}>
            {v}
          </div>
        </div>
      ))}
    </div>
  );
}

function CopyFallback({ text }: { text: string }) {
  return (
    <>
      <label className="sr" htmlFor="copy-text">Your result</label>
      <textarea className="copy-fallback" id="copy-text" readOnly value={text} onFocus={(e) => e.currentTarget.select()} autoFocus />
      <p className="note">Copy this text and paste it anywhere.</p>
    </>
  );
}
