-- Baazi: what the Supabase room store and wallets need beyond 20261114000000_rooms.sql.
-- Every table has RLS enabled with NO policies and no grants for anon/authenticated: only the Next.js
-- API routes (service-role key) can touch them.

alter table public.room_players add column if not exists avatar text;
alter table public.room_players add column if not exists wallet text;

-- Table chat: the API keeps the latest messages per table.
create table if not exists public.room_chat (
  id        text primary key,
  room_code text not null references public.rooms(code) on delete cascade,
  at        bigint not null,
  message   jsonb not null
);
create index if not exists room_chat_room_idx on public.room_chat (room_code, at desc);

-- Coin wallets, one JSON document per phone (key = hash of the phone's secret token), written with
-- an optimistic version check.
create table if not exists public.wallets (
  key        text primary key,
  data       jsonb not null,
  version    integer not null default 1,
  updated_at timestamptz not null default now()
);

alter table public.rooms enable row level security;
alter table public.room_players enable row level security;
alter table public.room_chat enable row level security;
alter table public.wallets enable row level security;

revoke all on public.rooms, public.room_players, public.room_chat, public.wallets from anon, authenticated;
