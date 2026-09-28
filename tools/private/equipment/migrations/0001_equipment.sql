-- Equipment: what the company owns, who holds it, and what happened to it.
-- People are member ids (mbr_…), never names; 'erased' replaces the id of a
-- person whose data was erased. The history of an item is append-only: a
-- trigger refuses to delete it or to change it, except to replace a
-- person's id by 'erased'. Money is in cents of the Chest's currency.

-- Kinds of things. The eight built-in ones have a key (their name comes from
-- the reader's catalogue until a manager renames them); a manager adds more.
-- A category of kind 'licence' holds licences and subscriptions: seats
-- instead of one holder.
create table categories (
  id bigint generated always as identity primary key,
  key text check (key in ('laptop', 'phone', 'screen', 'accessory', 'licence', 'key', 'vehicle', 'other')),
  name text check (name is null or char_length(name) between 1 and 40),
  icon text not null check (icon ~ '^[a-z]{1,16}$'),
  kind text not null default 'asset' check (kind in ('asset', 'licence')),
  position integer not null default 0,
  created_at timestamptz not null default now(),
  -- Removed by a manager: kept for the items that were in it, never listed.
  removed_at timestamptz,
  check (key is not null or name is not null)
);
create unique index categories_key on categories (key) where key is not null and removed_at is null;
insert into categories (key, icon, kind, position) values
  ('laptop', 'laptop', 'asset', 1),
  ('phone', 'phone', 'asset', 2),
  ('screen', 'screen', 'asset', 3),
  ('accessory', 'headset', 'asset', 4),
  ('licence', 'licence', 'licence', 5),
  ('key', 'key', 'asset', 6),
  ('vehicle', 'car', 'asset', 7),
  ('other', 'box', 'asset', 8);

create table items (
  id bigint generated always as identity primary key,
  category_id bigint not null references categories (id),
  -- The asset tag written on its label: EQ-0042 when the tool gives it.
  tag text not null check (tag ~ '^[A-Za-z0-9][A-Za-z0-9._/-]{0,31}$'),
  name text not null check (char_length(name) between 1 and 120),
  serial text check (serial is null or char_length(serial) between 1 and 80),
  status text not null default 'in_stock' check (status in ('in_stock', 'in_use', 'in_repair', 'lost', 'retired')),
  purchased_on date,
  price_cents bigint check (price_cents is null or price_cents between 0 and 100000000000),
  supplier text check (supplier is null or char_length(supplier) between 1 and 80),
  warranty_until date,
  notes text check (notes is null or char_length(notes) <= 4000),
  photo text,
  -- Licences and subscriptions.
  seats integer check (seats is null or seats between 1 and 100000),
  renews_on date,
  cost_cents bigint check (cost_cents is null or cost_cents between 0 and 100000000000),
  period text check (period is null or period in ('month', 'year')),
  -- Who or where it is now: a member, or a place ("Meeting room"), or
  -- nobody (in stock). Never both.
  holder text check (holder is null or holder ~ '^mbr_[a-z2-7]{26}$' or holder = 'erased'),
  place text check (place is null or char_length(place) between 1 and 80),
  held_since date,
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Removed by mistake-correction ("Delete", with undo): kept, never listed.
  deleted_at timestamptz,
  check (holder is null or place is null),
  check ((holder is null and place is null) = (held_since is null))
);
create unique index items_tag on items (lower(tag)) where deleted_at is null;
create index items_holder on items (holder) where deleted_at is null and holder is not null;
create index items_category on items (category_id) where deleted_at is null;

-- Licence seats: who has one. 'erased' may hold several seats of a licence.
create table seats (
  id bigint generated always as identity primary key,
  item_id bigint not null references items (id),
  member_id text not null check (member_id ~ '^mbr_[a-z2-7]{26}$' or member_id = 'erased'),
  since timestamptz not null default now()
);
create unique index seats_once on seats (item_id, member_id) where member_id <> 'erased';
create index seats_member on seats (member_id);

-- Problems a holder reported ("the screen flickers"), until a manager
-- marks them solved.
create table problems (
  id bigint generated always as identity primary key,
  item_id bigint not null references items (id),
  reported_by text not null,
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now(),
  solved_at timestamptz,
  solved_by text
);
create index problems_open on problems (item_id) where solved_at is null;

-- Everything that happened to an item, in order. Append-only.
create table history (
  id bigint generated always as identity primary key,
  item_id bigint not null references items (id),
  at timestamptz not null default now(),
  actor text not null,
  kind text not null check (kind in ('created', 'imported', 'edited', 'given', 'returned', 'status', 'seat_given', 'seat_taken', 'reported', 'solved', 'photo', 'deleted', 'restored', 'left')),
  -- The person concerned (the holder given to or taken back from), or a place.
  member text,
  place text,
  status text,
  -- The day it happened, as the manager said (a handover recorded late).
  day date,
  note text check (note is null or char_length(note) <= 1000)
);
create index history_item on history (item_id, id);

create function history_append_only() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'history is append-only';
  end if;
  if new.id <> old.id or new.item_id <> old.item_id or new.at <> old.at or new.kind <> old.kind
     or new.day is distinct from old.day or new.place is distinct from old.place or new.status is distinct from old.status or new.note is distinct from old.note
     or (new.actor <> old.actor and new.actor <> 'erased')
     or (new.member is distinct from old.member and new.member <> 'erased') then
    raise exception 'history is append-only';
  end if;
  return new;
end $$;
create trigger history_append_only before update or delete on history for each row execute function history_append_only();

-- The Chest's events already handled (at-least-once delivery).
create table chest_events (
  id text primary key,
  handled_at timestamptz not null default now()
);
