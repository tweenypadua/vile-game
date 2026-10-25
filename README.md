# VILE!

A daily film-villain guessing game. Every day a film villain goes on trial: their lawyer pleads their case, and players unseal up to five exhibits until they can name the film.

- **Web app:** Next.js 14 (App Router, TypeScript), deployed on Vercel
- **Database, sign-in, storage:** Supabase (PostgreSQL + Auth)
- **Film data and posters:** TMDB API
- **Instagram:** a 1080×1920 Story image shared through the phone's share sheet

## How it works

| Piece | Where |
| --- | --- |
| Game rules (matching, streaks, share text) | `src/lib/game.ts`, tested in `tests/game.test.ts` |
| Game API (today's case, guess, skip, stats) | `src/app/api/puzzle/*`, `src/lib/server/game-service.ts` |
| Autocomplete for the guess box | `src/app/api/films/search` → `search_films()` in Postgres |
| Sign-in (Google or email link) and device linking | `src/components/SignIn.tsx`, `src/app/auth/callback`, `src/app/api/auth/link` |
| Instagram Story image | `src/app/api/share/story/route.tsx` |
| Case desk for editors (TMDB search, scheduling) | `/admin`, `src/app/api/admin/*` |
| Daily housekeeping | `src/app/api/cron/daily` (Vercel Cron, see `vercel.json`) |
| Database schema | `supabase/migrations/0001_schema.sql` |
| The 30 launch cases | `supabase/data/cases.json` → `supabase/seed.sql` |

The answer, the poster and unearned clues never reach the browser before a round ends. Every table has row-level security turned on with no public access; only the server (with the service role key) reads and writes them.

Players don't need an account. Each device gets a random id, and a player can sign in later to keep their streak on every device: their device's history is merged into the account.

## Set up (about 30 minutes)

### 1. Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. Open **SQL Editor**, paste the contents of `supabase/migrations/0001_schema.sql`, and run it.
3. Paste `supabase/seed.sql` and run it. This loads the 30 cases, scheduled one per day from 24 Oct 2026, plus about 110 other films for the guess list.
4. **Authentication → Providers:** Email is on by default. To add Google, turn on the Google provider and follow the Supabase guide to create a Google OAuth client.
5. **Authentication → URL Configuration:** set the Site URL to your domain and add `https://YOUR-DOMAIN/auth/callback` (and `http://localhost:3000/auth/callback` for local work) to the redirect URLs.
6. **Project Settings → API:** copy the project URL, the `anon` key and the `service_role` key.

To change the launch date, run `npm run seed -- 2026-12-01` to rebuild `seed.sql` before step 3, and set `NEXT_PUBLIC_LAUNCH_DATE` to the same date.

### 2. TMDB

1. Create an account at [themoviedb.org](https://www.themoviedb.org) and request an API key under **Settings → API**.
2. Copy the **API Read Access Token** (the long one).

TMDB's API is free for non-commercial projects with attribution. The game already shows the required notice ("This product uses the TMDB API but is not endorsed or certified by TMDB"). TMDB also asks you to show one of their approved logos: download it from their logo page and add it to the footer in `src/components/Game.tsx`. If VILE! starts earning money (ads, tips, paid features), contact TMDB for a commercial licence first. Poster artwork belongs to the studios; TMDB's licence covers their data and image hosting, so check with them about showing posters on the result screen.

### 3. Run it locally

```bash
npm install
npm run fonts          # copies the Story image fonts into src/assets/fonts
cp .env.example .env.local   # then fill in the values
npm run dev
```

Open http://localhost:3000. Run `npm test` for the game-rule tests and `npm run typecheck` for TypeScript.

### 4. Deploy to Vercel

1. Import this GitHub repo at [vercel.com/new](https://vercel.com/new).
2. Add every variable from `.env.example` under **Settings → Environment Variables**. Set `NEXT_PUBLIC_SITE_URL` to your real domain; it appears in the share text and on the Story image.
3. Deploy. Vercel picks up the daily cron job from `vercel.json` and sends `CRON_SECRET` with it.

### 5. Fill in posters and the guess list

Sign in at `/admin` with an email listed in `ADMIN_EMAILS`, then:

- **Fetch posters for scheduled films** matches every scheduled case to TMDB and saves its poster, genres and TMDB id.
- **Add popular films to the guess list** adds TMDB's top-rated and popular films, so autocomplete doesn't give the answer away.
- **Schedule case**: search TMDB, pick the film, write the five clues and pick a date. Keep at least a week of cases scheduled; the daily job logs a warning when fewer than seven days are left.

## Instagram

On a phone, **Share to Story** opens the phone's share sheet with the Story image attached; the player picks Instagram and the image opens in the Story editor. This uses the Web Share API, so it needs no Facebook App ID or Meta review. Where file sharing isn't available (most desktop browsers), the game shows the image with a **Save image** button instead.

Meta's direct "Sharing to Stories" integration (with a Facebook App ID) works only from native iOS and Android apps. Add it if VILE! gets a native app later.

## API

| Method | Path | Body | Returns |
| --- | --- | --- | --- |
| GET | `/api/puzzle/today?date=YYYY-MM-DD` | | Today's case as this device may see it |
| POST | `/api/puzzle/:n/guess` | `{ guess, filmId?, date }` | Updated case; the answer once the round ends |
| POST | `/api/puzzle/:n/skip` | `{ date }` | Updated case |
| GET | `/api/films/search?q=` | | Up to 8 `{ id, title, year }` |
| POST | `/api/auth/link` | `{ date }` | Merged stats after sign-in |
| GET | `/api/me` | | `{ email, isAdmin }` |
| GET | `/api/share/story?c&d&r&s&a&w` | | 1080×1920 PNG |
| GET | `/api/cron/daily` | | Housekeeping report (needs `CRON_SECRET`) |

Game calls send the device id in an `X-Player-Id` header. `date` is the player's local date, which decides which case is "today" for them.
