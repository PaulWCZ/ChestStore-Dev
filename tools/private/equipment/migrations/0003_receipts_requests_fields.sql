-- After the first critique: what a company needs to cancel Snipe-IT.
--
-- 1. Receipts: an item given to a person waits for them to say "I received
--    it" (who, when, a remark, the rules they accepted); the printable
--    handover and return sheets read them. A receipt is closed (never
--    deleted) when the item leaves the person before they confirmed.
-- 2. Rules (a charter) a manager may set; every version is kept, a receipt
--    names the one accepted.
-- 3. Requests: "I need a charger" — open, approved, refused, done or
--    cancelled.
-- 4. Fields per category (IMEI, RAM, licence plate…): their values live on
--    the item, keyed by the field's id.
-- 5. Items with a quantity (cables, toner, badges in bulk): a category of
--    kind 'consumable'; a count and a minimum on the item.
-- 6. Inventories: an inventory is opened, each item seen is ticked, it is
--    closed; what was not seen is what is missing.
-- 7. The history gains what repairs, hand-outs and restocks need (a
--    quantity, a cost, a reference, a day expected), and new kinds; it stays
--    append-only.
-- 8. An invoice (a file of the Chest) per item.

-- ---- Categories: items with a quantity ------------------------------------
alter table categories drop constraint categories_key_check;
alter table categories add constraint categories_key_check
  check (key in ('laptop', 'phone', 'screen', 'accessory', 'licence', 'key', 'vehicle', 'other', 'consumable'));
alter table categories drop constraint categories_kind_check;
alter table categories add constraint categories_kind_check check (kind in ('asset', 'licence', 'consumable'));
insert into categories (key, icon, kind, position)
  select 'consumable', 'plug', 'consumable', coalesce(max(position), 0) + 1 from categories
  where not exists (select 1 from categories where key = 'consumable' and removed_at is null);

-- ---- Items: fields, quantities, invoice -------------------------------------
alter table items add column extra jsonb not null default '{}'::jsonb check (jsonb_typeof(extra) = 'object');
alter table items add column quantity integer check (quantity is null or quantity between 0 and 1000000);
alter table items add column min_quantity integer check (min_quantity is null or min_quantity between 0 and 1000000);
alter table items add column invoice text;

-- ---- Fields per category ------------------------------------------------------
create table fields (
  id bigint generated always as identity primary key,
  category_id bigint not null references categories (id),
  name text not null check (char_length(name) between 1 and 40),
  type text not null default 'text' check (type in ('text', 'number', 'date')),
  position integer not null default 0,
  created_at timestamptz not null default now(),
  -- Removed by a manager: its values stay on the items, never shown.
  removed_at timestamptz
);
create unique index fields_name on fields (category_id, lower(name)) where removed_at is null;

-- ---- Rules (charter) ------------------------------------------------------------
-- Each save is a new version; an empty body means "no rules". The newest is
-- the one shown.
create table charters (
  id bigint generated always as identity primary key,
  body text not null check (char_length(body) <= 8000),
  created_by text not null,
  created_at timestamptz not null default now()
);

-- ---- Receipts -----------------------------------------------------------------
create table receipts (
  id bigint generated always as identity primary key,
  item_id bigint not null references items (id),
  member_id text not null check (member_id ~ '^mbr_[a-z2-7]{26}$' or member_id = 'erased'),
  given_by text not null,
  given_on date not null,
  -- The condition the manager noted when giving it.
  condition text check (condition is null or char_length(condition) <= 1000),
  created_at timestamptz not null default now(),
  confirmed_at timestamptz,
  -- What the person noted when confirming ("a scratch on the lid").
  remark text check (remark is null or char_length(remark) <= 1000),
  charter_id bigint references charters (id),
  -- The item left them (taken back, given to someone else), confirmed or
  -- not; an Undo of the take-back opens it again.
  closed_at timestamptz
);
create index receipts_open on receipts (member_id) where confirmed_at is null and closed_at is null;
create index receipts_item on receipts (item_id, id);

-- ---- Requests -------------------------------------------------------------------
create table requests (
  id bigint generated always as identity primary key,
  member_id text not null check (member_id ~ '^mbr_[a-z2-7]{26}$' or member_id = 'erased'),
  body text not null check (char_length(body) between 1 and 500),
  category_id bigint references categories (id),
  status text not null default 'open' check (status in ('open', 'approved', 'refused', 'done', 'cancelled')),
  answer text check (answer is null or char_length(answer) <= 500),
  decided_by text,
  decided_at timestamptz,
  item_id bigint references items (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index requests_waiting on requests (status) where status in ('open', 'approved');
create index requests_member on requests (member_id, id);

-- ---- Inventories ------------------------------------------------------------------
create table inventories (
  id bigint generated always as identity primary key,
  started_by text not null,
  started_at timestamptz not null default now(),
  closed_by text,
  closed_at timestamptz,
  -- How many items it covered when it closed, and how many were seen.
  total integer,
  seen integer
);
-- One inventory open at a time.
create unique index inventories_open on inventories ((closed_at is null)) where closed_at is null;
create table sightings (
  inventory_id bigint not null references inventories (id),
  item_id bigint not null references items (id),
  seen_by text not null,
  seen_at timestamptz not null default now(),
  primary key (inventory_id, item_id)
);
-- What an inventory missed, written when it closes (the list stays true
-- after items move on).
create table inventory_missing (
  inventory_id bigint not null references inventories (id),
  item_id bigint not null references items (id),
  primary key (inventory_id, item_id)
);

-- ---- History: new kinds and what they carry --------------------------------------
alter table history add column qty integer check (qty is null or qty between 1 and 1000000);
alter table history add column cost_cents bigint check (cost_cents is null or cost_cents between 0 and 100000000000);
alter table history add column ref text check (ref is null or char_length(ref) <= 80);
alter table history add column due date;
alter table history drop constraint history_kind_check;
alter table history add constraint history_kind_check check (kind in (
  'created', 'imported', 'edited', 'given', 'returned', 'status', 'seat_given', 'seat_taken', 'reported', 'solved', 'photo', 'deleted', 'restored', 'left',
  'received', 'handed_out', 'restocked', 'invoice'));

create or replace function history_append_only() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'history is append-only';
  end if;
  if new.id <> old.id or new.item_id <> old.item_id or new.at <> old.at or new.kind <> old.kind
     or new.day is distinct from old.day or new.place is distinct from old.place or new.status is distinct from old.status or new.note is distinct from old.note
     or new.qty is distinct from old.qty or new.cost_cents is distinct from old.cost_cents or new.ref is distinct from old.ref or new.due is distinct from old.due
     or (new.actor <> old.actor and new.actor <> 'erased')
     or (new.member is distinct from old.member and new.member <> 'erased') then
    raise exception 'history is append-only';
  end if;
  return new;
end $$;
