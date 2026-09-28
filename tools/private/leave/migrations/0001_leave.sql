-- Leave: the company's rules, its leave types, each person's approver and
-- start date, the requests, and the balances as an append-only ledger.
-- People are member ids (mbr_…), never names or addresses; 'erased' stands
-- for someone whose data the owner had erased.

-- The company's rules: one row.
create table settings (
  id boolean primary key default true check (id),
  -- How paid leave is counted: jours ouvrés (Monday to Friday) or jours
  -- ouvrables (Monday to Saturday).
  counting text not null default 'ouvres' check (counting in ('ouvres', 'ouvrables')),
  -- Alsace-Moselle: Good Friday and 26 December are public holidays too.
  alsace boolean not null default false,
  -- The public holidays the company works (e.g. Whit Monday as the
  -- "journée de solidarité"): they cost leave like any day.
  worked_holidays text[] not null default '{}',
  -- The first month of the reference period for earned leave (June).
  period_start_month int not null default 6 check (period_start_month between 1 and 12),
  updated_by text,
  updated_at timestamptz
);
insert into settings default values;

-- The kinds of leave. A built-in one has a key (its name comes from the
-- reader's language) unless HR renamed it; one HR adds has a name.
create table leave_types (
  id bigint generated always as identity primary key,
  key text unique check (key in ('paid', 'rtt', 'unpaid', 'sick', 'other')),
  name text check (char_length(name) between 1 and 40),
  color text not null check (color in ('sky', 'mint', 'peach', 'lilac', 'sun', 'rose', 'sand', 'sea')),
  -- Counted against a balance (paid leave, RTT) or only recorded.
  balance boolean not null,
  -- Days earned a year, month by month (paid leave: 25 jours ouvrés); 0:
  -- nothing earned by itself (HR adds days).
  per_year numeric(5, 2) not null default 0 check (per_year between 0 and 60),
  half_days boolean not null default true,
  -- The company's counting, or every calendar day (sick leave).
  counting text not null default 'company' check (counting in ('company', 'calendar')),
  -- Asked and answered, or only declared (sick leave: recorded at once, the
  -- approver is told).
  approval boolean not null default true,
  -- Whether a note may be written: never for sick leave (health data).
  notes boolean not null default true,
  position int not null,
  archived_at timestamptz,
  check (key is not null or name is not null),
  check (balance or per_year = 0)
);
insert into leave_types (key, color, balance, per_year, half_days, counting, approval, notes, position) values
  ('paid', 'sky', true, 25, true, 'company', true, true, 1),
  ('rtt', 'mint', true, 0, true, 'company', true, true, 2),
  ('unpaid', 'sand', false, 0, true, 'company', true, true, 3),
  ('sick', 'peach', false, 0, false, 'calendar', false, false, 4),
  ('other', 'lilac', false, 0, true, 'company', true, true, 5);

-- Each person as HR set them: who answers their requests (null: HR), and
-- since when they earn leave.
create table staff (
  member_id text primary key check (member_id ~ '^mbr_[a-z2-7]{26}$'),
  approver_id text check (approver_id ~ '^mbr_[a-z2-7]{26}$'),
  start_date date,
  updated_at timestamptz not null default now(),
  check (approver_id is distinct from member_id)
);
create index staff_approver on staff (approver_id) where approver_id is not null;

create table requests (
  id bigint generated always as identity primary key,
  member_id text not null check (member_id ~ '^mbr_[a-z2-7]{26}$' or member_id = 'erased'),
  type_id bigint not null references leave_types (id),
  start_date date not null,
  start_half text not null check (start_half in ('am', 'pm')),
  end_date date not null,
  end_half text not null check (end_half in ('am', 'pm')),
  -- What it costs, computed when asked with the rules of that day.
  days numeric(6, 1) not null check (days > 0),
  note text check (char_length(note) <= 300),
  status text not null default 'pending' check (status in ('pending', 'approved', 'refused', 'cancelled')),
  -- The requester asked to cancel an approved request; the approver decides.
  cancel_asked_at timestamptz,
  decided_by text check (decided_by ~ '^mbr_[a-z2-7]{26}$' or decided_by in ('erased', 'chest')),
  decided_at timestamptz,
  reason text check (char_length(reason) <= 300),
  created_at timestamptz not null default now(),
  check (end_date >= start_date),
  check (end_date > start_date or not (start_half = 'pm' and end_half = 'am'))
);
create index requests_member on requests (member_id, start_date);
create index requests_dates on requests (start_date, end_date) where status in ('pending', 'approved');
create index requests_open on requests (created_at) where status = 'pending' or cancel_asked_at is not null;

-- What happened to a request, in order: asked, approved, refused,
-- cancel_asked, cancel_declined, cancelled, reopened, restored.
create table request_events (
  id bigint generated always as identity primary key,
  request_id bigint not null references requests (id),
  actor text not null check (actor ~ '^mbr_[a-z2-7]{26}$' or actor in ('erased', 'chest')),
  kind text not null check (kind in ('asked', 'declared', 'approved', 'refused', 'cancel_asked', 'cancel_declined', 'cancelled', 'reopened', 'restored', 'left')),
  reason text check (char_length(reason) <= 300),
  at timestamptz not null default now()
);
create index request_events_request on request_events (request_id, id);

-- Balances: every change is a line, never changed nor deleted (the trigger
-- below). A balance is the latest opening line of a person and a type, the
-- lines after it, and what they earned since (computed when read).
create table ledger (
  id bigint generated always as identity primary key,
  member_id text not null check (member_id ~ '^mbr_[a-z2-7]{26}$' or member_id = 'erased'),
  type_id bigint not null references leave_types (id),
  kind text not null check (kind in ('opening', 'adjustment', 'taken', 'returned')),
  days numeric(7, 2) not null,
  on_date date not null,
  reason text check (char_length(reason) <= 300),
  request_id bigint references requests (id),
  created_by text not null check (created_by ~ '^mbr_[a-z2-7]{26}$' or created_by in ('erased', 'chest')),
  created_at timestamptz not null default now()
);
create index ledger_member on ledger (member_id, type_id, id);

-- Append-only: a line is never deleted; the only change allowed is the
-- anonymisation of an erasure (people become 'erased', the reason goes),
-- which keeps the days, the dates and the kind.
create function ledger_append_only() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'ledger lines are never deleted';
  end if;
  if new.id <> old.id or new.type_id <> old.type_id or new.kind <> old.kind or new.days <> old.days
     or new.on_date <> old.on_date or new.request_id is distinct from old.request_id or new.created_at <> old.created_at
     or (new.member_id <> old.member_id and new.member_id <> 'erased')
     or (new.created_by <> old.created_by and new.created_by <> 'erased')
     or (new.reason is distinct from old.reason and new.reason is not null) then
    raise exception 'ledger lines are never changed';
  end if;
  return new;
end $$;
create trigger ledger_append_only before update or delete on ledger for each row execute function ledger_append_only();

-- The events of the members' lifecycle already handled (events.handle):
-- the Chest delivers at least once.
create table chest_events (
  id text primary key,
  handled_at timestamptz not null default now()
);
