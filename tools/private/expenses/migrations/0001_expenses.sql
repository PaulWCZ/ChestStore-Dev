-- Expenses: what people paid for work, the receipts that prove it, who
-- approves it, and what the company paid back. People are member ids
-- (mbr_…); 'erased' replaces one whose data was erased (the accounting
-- record stays: it is a legal obligation). Amounts are integer cents.

-- Company settings, one row per key (lib/settings.ts gives the defaults).
create table settings (
  key text primary key,
  value jsonb not null
);

-- What an expense is for. A built-in category has a key (named in each
-- reader's language) until the accountant renames it.
create table categories (
  id bigint generated always as identity primary key,
  key text unique check (key in ('meals', 'travel', 'lodging', 'fuel', 'supplies', 'other', 'mileage')),
  name text check (name is null or char_length(name) between 1 and 60),
  -- The account of the company's chart where it is booked ("625600").
  account text not null default '' check (char_length(account) <= 20),
  -- The share of the VAT the company may recover, in percent (0, 80, 100…).
  vat_recovery smallint not null default 100 check (vat_recovery between 0 and 100),
  -- Above this amount (in the company's currency), a warning; never a block.
  cap_cents bigint check (cap_cents is null or cap_cents > 0),
  mileage boolean not null default false,
  position integer not null default 0,
  archived_at timestamptz,
  constraint named check (key is not null or name is not null)
);

insert into categories (key, account, vat_recovery, mileage, position) values
  ('meals', '625700', 100, false, 1),
  ('travel', '625100', 0, false, 2),
  ('lodging', '625600', 0, false, 3),
  ('fuel', '606100', 80, false, 4),
  ('supplies', '606400', 100, false, 5),
  ('other', '628000', 0, false, 6),
  ('mileage', '625100', 0, true, 7);

-- The French mileage scale (barème kilométrique) of a year, as data the
-- accountant checks and edits each year (lib/mileage.ts reads it).
create table mileage_scales (
  year integer primary key check (year between 2000 and 2100),
  data jsonb not null,
  source text not null default '' check (char_length(source) <= 500),
  updated_by text,
  updated_at timestamptz not null default now()
);

-- Each person's vehicle, chosen once in "My vehicle".
create table vehicles (
  member_id text primary key check (member_id ~ '^mbr_[a-z2-7]{26}$'),
  kind text not null check (kind in ('car', 'motorbike', 'moped')),
  power text not null check (char_length(power) between 1 and 10),
  electric boolean not null default false,
  updated_at timestamptz not null default now()
);

-- Who approves whose expenses; without a row, the accountants do.
create table approvers (
  member_id text primary key check (member_id ~ '^mbr_[a-z2-7]{26}$'),
  approver_id text not null check (approver_id ~ '^mbr_[a-z2-7]{26}$'),
  constraint not_self check (member_id <> approver_id)
);
create index approvers_by on approvers (approver_id);

-- Expenses sent together.
create table claims (
  id bigint generated always as identity primary key,
  member_id text not null,
  submitted_at timestamptz not null default now()
);

create table expenses (
  id bigint generated always as identity primary key,
  member_id text not null check (member_id = 'erased' or member_id ~ '^mbr_[a-z2-7]{26}$'),
  kind text not null check (kind in ('expense', 'mileage')),
  -- draft: the owner's (a refusal brings it back, with its reason);
  -- submitted: waiting for the approver; approved; paid (reimbursed).
  status text not null default 'draft' check (status in ('draft', 'submitted', 'approved', 'paid')),
  spent_on date not null,
  amount_cents bigint not null check (amount_cents > 0 and amount_cents <= 100000000),
  currency text not null default 'EUR' check (currency ~ '^[A-Z]{3}$'),
  vat_cents bigint check (vat_cents is null or (vat_cents >= 0 and vat_cents <= amount_cents)),
  category_id bigint not null references categories (id),
  merchant text not null default '' check (char_length(merchant) <= 120),
  note text not null default '' check (char_length(note) <= 1000),
  -- me: paid with their own money, to reimburse; company: the company's
  -- card, nothing to reimburse (the receipt is still needed).
  paid_by text not null default 'me' check (paid_by in ('me', 'company')),
  -- The receipt, as uploaded (never changed), and its SHA-256.
  receipt_object text unique,
  receipt_name text check (receipt_name is null or char_length(receipt_name) <= 200),
  receipt_type text,
  receipt_size bigint,
  receipt_sha256 text check (receipt_sha256 is null or receipt_sha256 ~ '^[0-9a-f]{64}$'),
  -- A trip with one's own vehicle: the scale gives the amount.
  from_place text check (from_place is null or char_length(from_place) <= 120),
  to_place text check (to_place is null or char_length(to_place) <= 120),
  distance_tenths integer check (distance_tenths is null or distance_tenths between 1 and 100000),
  vehicle text check (vehicle is null or vehicle in ('car', 'motorbike', 'moped')),
  power text,
  electric boolean,
  scale_year integer,
  claim_id bigint references claims (id),
  -- Who decides, set when it is sent: null means the accountants.
  approver_id text,
  submitted_at timestamptz,
  decided_by text,
  decided_at timestamptz,
  refused_reason text check (refused_reason is null or char_length(refused_reason) <= 500),
  paid_on date,
  paid_marked_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Deleted drafts wait a week (undo), then go with their receipt.
  deleted_at timestamptz,
  constraint trip check (kind <> 'mileage' or (distance_tenths is not null and vehicle is not null and power is not null and electric is not null and scale_year is not null)),
  constraint company_card_not_paid check (paid_by = 'me' or status <> 'paid')
);
create index expenses_member on expenses (member_id, spent_on desc) where deleted_at is null;
create index expenses_status on expenses (status, approver_id) where deleted_at is null;
create index expenses_month on expenses (spent_on) where deleted_at is null and status in ('approved', 'paid');
create index expenses_receipt on expenses (receipt_sha256) where receipt_sha256 is not null;

-- What happened to an expense: sent, approved, refused (and why), paid.
create table history (
  id bigint generated always as identity primary key,
  expense_id bigint not null references expenses (id) on delete cascade,
  actor text not null,
  kind text not null check (kind in ('created', 'edited', 'submitted', 'approved', 'refused', 'paid', 'unpaid', 'reassigned')),
  detail text not null default '' check (char_length(detail) <= 500),
  at timestamptz not null default now()
);
create index history_expense on history (expense_id, at);

-- Receipts a member's browser was allowed to upload, not yet on an expense:
-- the name the tool chose, for that member only; cleaned after a day.
create table uploads (
  object text primary key,
  member_id text not null,
  created_at timestamptz not null default now()
);
create index uploads_member on uploads (member_id);

-- The Chest's lifecycle events already handled.
create table chest_events (
  id text primary key,
  at timestamptz not null default now()
);

-- The scale for the distances of 2025 (unchanged from 2024), as read on
-- 2026-09-28 from search results (reports/02-open-source/expenses.md): rates
-- in thousandths of a euro per km, fixed parts in euros, by the year's
-- total distance. The two larger motorbike rows were not verified. The
-- accountant checks it each year on impots.gouv.fr (Settings).
insert into mileage_scales (year, data, source) values (2025, '{
  "electricBonus": 20,
  "car": { "limits": [5000, 20000], "rows": [
    { "power": "3", "bands": [[529, 0], [316, 1065], [370, 0]] },
    { "power": "4", "bands": [[606, 0], [340, 1330], [407, 0]] },
    { "power": "5", "bands": [[636, 0], [357, 1395], [427, 0]] },
    { "power": "6", "bands": [[665, 0], [374, 1457], [447, 0]] },
    { "power": "7", "bands": [[697, 0], [394, 1515], [470, 0]] } ] },
  "motorbike": { "limits": [3000, 6000], "rows": [
    { "power": "1-2", "bands": [[395, 0], [99, 891], [248, 0]] },
    { "power": "3-5", "bands": [[468, 0], [82, 1158], [275, 0]] },
    { "power": "6", "bands": [[606, 0], [79, 1583], [343, 0]] } ] },
  "moped": { "limits": [3000, 6000], "rows": [
    { "power": "50", "bands": [[315, 0], [79, 711], [198, 0]] } ] }
}', 'https://www.economie.gouv.fr/particuliers/impots-et-fiscalite/gerer-mon-impot-sur-le-revenu/impot-sur-le-revenu-tout-savoir-sur-le-bareme-des-frais-kilometriques (read 2026-09-28; motorbike 3–5 CV and over 5 CV rows not verified)');
