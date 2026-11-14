-- Online tables for Baazi (same model as Rung).
--
-- Both tables have RLS enabled with NO policies: the browser (anon key) can't read or write them
-- at all. Every read/write goes through the Next.js API routes using the service-role key, which
-- is what keeps other players' hands secret. Live updates are pushed with Realtime *broadcast*
-- (no table access needed), and clients re-fetch their own seat's view from the API.

create table if not exists public.rooms (
  code        text primary key,
  status      text not null default 'lobby' check (status in ('lobby', 'playing')),
  options     jsonb not null default '{"series": 3}'::jsonb,
  -- { game: GameState, seats: [{ seat, name, isBot, playerId }] } once started
  state       jsonb,
  version     integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.room_players (
  id          uuid primary key default gen_random_uuid(),
  room_code   text not null references public.rooms(code) on delete cascade,
  name        text not null check (char_length(name) between 1 and 24),
  seat        smallint check (seat between 0 and 3),
  is_host     boolean not null default false,
  -- secret the browser keeps in localStorage to act as this player
  token       text not null unique,
  last_seen   timestamptz not null default now(),
  created_at  timestamptz not null default now()
);

create unique index if not exists room_players_room_seat_uniq
  on public.room_players (room_code, seat) where seat is not null;
create index if not exists room_players_room_idx on public.room_players (room_code);
create index if not exists rooms_updated_idx on public.rooms (updated_at);

alter table public.rooms enable row level security;
alter table public.room_players enable row level security;

-- Housekeeping: drop rooms nobody has touched for a day. Call from a cron job if you like:
--   select public.cleanup_stale_rooms();
create or replace function public.cleanup_stale_rooms() returns integer
language sql security definer set search_path = public as $$
  with gone as (
    delete from public.rooms where updated_at < now() - interval '1 day' returning 1
  )
  select count(*)::int from gone;
$$;

revoke all on function public.cleanup_stale_rooms() from public, anon, authenticated;
