-- Baazi quick match: a table the server fills for you (other people searching for the same game first,
-- then lifelike computer players). A quick-match table is an ordinary room with two extra columns while
-- it fills up; matching is done by the API with the existing guarantees: the unique (room_code, seat)
-- index means two phones can never take the same seat, and the versioned room update means only one
-- request can start the game.
--
-- RLS stays on with no policies: only the API (service-role key) touches these tables.

-- The quick-match bookkeeping (who is due to sit down when) and the key it is matched on, e.g. 'rung:4'.
alter table public.rooms add column if not exists quick jsonb;
alter table public.rooms add column if not exists quick_key text;
create index if not exists rooms_quick_open_idx on public.rooms (quick_key, created_at) where status = 'lobby' and quick_key is not null;

-- room_players.last_seen already exists (20261114000000_rooms.sql); a filling table forgets phones that
-- stopped asking about it. Make sure it is there on databases made before that column was added.
alter table public.room_players add column if not exists last_seen timestamptz not null default now();

-- Tables of up to six (Bhabhi, G Patta): the first migration only allowed seats 0 to 3.
alter table public.room_players drop constraint if exists room_players_seat_check;
alter table public.room_players add constraint room_players_seat_check check (seat between 0 and 5);

alter table public.rooms enable row level security;
alter table public.room_players enable row level security;
revoke all on public.rooms, public.room_players from anon, authenticated;
