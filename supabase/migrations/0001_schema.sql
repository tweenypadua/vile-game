-- VILE! database schema (PostgreSQL on Supabase)
-- All tables have row-level security turned on with no public policies:
-- the browser never reads them directly. The Next.js API reads and writes
-- with the service role key, so answers and unearned clues never reach a player early.

create extension if not exists pg_trgm;
create extension if not exists citext;

create type clue_kind as enum ('villain_defense', 'villain_identity', 'prosecution', 'genre_year', 'plot_summary');
create type puzzle_state as enum ('draft', 'scheduled', 'live', 'archived');
create type play_status as enum ('in_progress', 'won', 'lost');

-- Signed-in accounts (one row per Supabase Auth user) --------------------
create table profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  email        citext unique,
  display_name text,
  timezone     text,
  created_at   timestamptz not null default now()
);

-- Content ------------------------------------------------------------------
create table films (
  id                 bigserial primary key,
  tmdb_id            integer unique,
  title              text not null,
  title_normalized   text not null,
  release_year       smallint not null,
  genres             text[] not null default '{}',
  poster_url         text,          -- licensed image, shown only after the round
  poster_attribution text,
  popularity         real not null default 0,
  created_at         timestamptz not null default now(),
  unique (title_normalized, release_year)
);
create index films_title_trgm on films using gin (title_normalized gin_trgm_ops);

create table film_aliases (
  id               bigserial primary key,
  film_id          bigint not null references films(id) on delete cascade,
  alias            text not null,
  alias_normalized text not null,
  unique (film_id, alias_normalized)
);
create index film_aliases_lookup on film_aliases (alias_normalized);

create table puzzles (
  id            bigserial primary key,
  puzzle_number integer not null unique,
  publish_date  date not null unique,
  film_id       bigint not null references films(id),
  state         puzzle_state not null default 'scheduled',
  created_by    uuid references profiles(id) on delete set null,
  created_at    timestamptz not null default now()
);

create table puzzle_clues (
  id        bigserial primary key,
  puzzle_id bigint not null references puzzles(id) on delete cascade,
  position  smallint not null check (position between 1 and 5),
  kind      clue_kind not null,
  body      text not null,
  unique (puzzle_id, position)
);

-- Players --------------------------------------------------------------------
-- One row per device. user_id is filled in when the player signs in.
create table players (
  id           uuid primary key,
  user_id      uuid references profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create index players_user on players (user_id);

-- Play history ---------------------------------------------------------------
create table plays (
  id          bigserial primary key,
  player_id   uuid not null references players(id) on delete cascade,
  user_id     uuid references profiles(id) on delete set null,
  puzzle_id   bigint not null references puzzles(id) on delete cascade,
  status      play_status not null default 'in_progress',
  clues_shown smallint not null default 1 check (clues_shown between 1 and 5),
  solved_on   smallint check (solved_on between 1 and 5),
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  unique (player_id, puzzle_id)
);
create index plays_user on plays (user_id) where user_id is not null;

create table guesses (
  id              bigserial primary key,
  play_id         bigint not null references plays(id) on delete cascade,
  attempt         smallint not null check (attempt between 1 and 5),
  is_skip         boolean not null default false,
  raw_text        text,
  matched_film_id bigint references films(id),
  is_correct      boolean not null default false,
  created_at      timestamptz not null default now(),
  unique (play_id, attempt)
);

-- Cached totals for the stats screen. owner_key is 'user:<uuid>' or 'player:<uuid>'.
-- Always rebuildable from plays.
create table player_stats (
  owner_key          text primary key,
  played             integer not null default 0,
  wins               integer not null default 0,
  current_streak     integer not null default 0,
  max_streak         integer not null default 0,
  last_won_puzzle    integer,
  last_played_puzzle integer,
  solved_on_counts   integer[] not null default '{0,0,0,0,0}',
  updated_at         timestamptz not null default now()
);

-- Row-level security: closed to anon and authenticated roles --------------
alter table profiles     enable row level security;
alter table films        enable row level security;
alter table film_aliases enable row level security;
alter table puzzles      enable row level security;
alter table puzzle_clues enable row level security;
alter table players      enable row level security;
alter table plays        enable row level security;
alter table guesses      enable row level security;
alter table player_stats enable row level security;

-- A signed-in user may read their own profile.
create policy "own profile" on profiles for select to authenticated using (auth.uid() = id);

-- Create a profile row whenever someone signs up.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Autocomplete for the guess box: closest titles first, then the most popular.
create function public.search_films(q text, max_results int default 8)
returns table (id bigint, title text, release_year smallint)
language sql stable set search_path = public, extensions as $$
  select f.id, f.title, f.release_year
  from films f
  where f.title_normalized like '%' || q || '%'
     or exists (select 1 from film_aliases a where a.film_id = f.id and a.alias_normalized like '%' || q || '%')
  order by (f.title_normalized like q || '%') desc, similarity(f.title_normalized, q) desc, f.popularity desc, f.title
  limit max_results;
$$;
