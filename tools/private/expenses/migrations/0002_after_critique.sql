-- After the severe critique of 2026-09-29: a refusal that means something,
-- guests on meals, tolls and parking, flat rates and hotel nights, foreign
-- currencies with a rate, bank details and the SEPA transfer file, the
-- kilometres driven before the tool, the vehicle's registration, the
-- accounting journal. 0001 shipped: it is never edited.

-- A refused expense remembers what it looked like when it was refused
-- (lib/expenses.ts, fingerprint()): it cannot be sent again, nor approved,
-- until its owner changed something.
alter table expenses add column refused_fingerprint text check (refused_fingerprint is null or refused_fingerprint ~ '^[0-9a-f]{64}$');

-- Guests on meals: who was at the table (French practice for business
-- meals: the names and companies of the guests). People of the Chest by id,
-- people from outside by name. A category asks for them when `guests` is
-- on (meals by default); an expense of such a category without guests gets
-- a warning, never a block.
alter table categories add column guests boolean not null default false;
update categories set guests = true where key = 'meals';
alter table expenses add column guest_members text[] not null default '{}' check (cardinality(guest_members) <= 30);
alter table expenses add column guest_names text[] not null default '{}' check (cardinality(guest_names) <= 30);

-- Tolls and parking: their own category (VAT generally recoverable; the
-- accountant checks). Built-in keys grow: 'parking', and 'allowance' for
-- flat rates (below).
alter table categories drop constraint categories_key_check;
alter table categories add constraint categories_key_check check (key in ('meals', 'travel', 'lodging', 'fuel', 'supplies', 'other', 'mileage', 'parking', 'allowance'));
update categories set position = position + 1 where position >= 3;
insert into categories (key, account, vat_recovery, mileage, position) values ('parking', '625100', 100, false, 3);

-- Foreign currencies: an expense in another currency than the company's
-- has a rate (units of the company's currency for one unit of its own, in
-- millionths), typed by its owner (the rate of their card statement) or
-- the company's rate for that currency; `base_cents` is then its amount in
-- `base_currency` (the company's when it was saved). Without a rate, no
-- base: it stays apart, with a warning.
alter table expenses add column rate_micro bigint check (rate_micro is null or rate_micro between 1 and 1000000000000);
alter table expenses add column rate_source text check (rate_source is null or rate_source in ('typed', 'company'));
alter table expenses add column base_cents bigint check (base_cents is null or base_cents > 0);
alter table expenses add column base_currency text check (base_currency is null or base_currency ~ '^[A-Z]{3}$');
update expenses set base_cents = amount_cents, base_currency = currency
  where currency = coalesce((select value #>> '{}' from settings where key = 'currency'), 'EUR');

-- The company's rates, set by the accountant (e.g. each month).
create table rates (
  currency text primary key check (currency ~ '^[A-Z]{3}$'),
  rate_micro bigint not null check (rate_micro between 1 and 1000000000000),
  updated_by text not null,
  updated_at timestamptz not null default now()
);

-- Bank details: each person's account for their reimbursements, and the
-- company's ('company') for the transfer file. The IBAN is sealed
-- (lib/seal.ts), shown masked; only the person and the accountants reach
-- it, and only the transfer file carries it whole.
create table bank_accounts (
  owner text primary key check (owner = 'company' or owner ~ '^mbr_[a-z2-7]{26}$'),
  iban text not null check (char_length(iban) <= 400),
  last4 text not null check (last4 ~ '^[A-Z0-9]{4}$'),
  country text not null check (country ~ '^[A-Z]{2}$'),
  bic text check (bic is null or bic ~ '^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$'),
  -- The name on the account when it is not the person's own name.
  holder text not null default '' check (char_length(holder) <= 70),
  updated_by text not null,
  updated_at timestamptz not null default now()
);

-- A batch of reimbursements paid by one transfer file (SEPA credit
-- transfer, pain.001.001.03). `file` keeps what the file says (the payer's
-- account, each transfer's sealed IBAN, amount and expenses), so that the
-- same file can be downloaded again; a cancelled batch gives its expenses
-- back to "to pay".
create table payment_runs (
  id bigint generated always as identity primary key,
  message_id text not null unique check (char_length(message_id) <= 35),
  created_by text not null,
  created_at timestamptz not null default now(),
  execution_date date not null,
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  count integer not null check (count > 0),
  total_cents bigint not null check (total_cents > 0),
  file jsonb not null,
  cancelled_by text,
  cancelled_at timestamptz
);
alter table expenses add column payment_run_id bigint references payment_runs (id);
alter table history drop constraint history_kind_check;
alter table history add constraint history_kind_check check (kind in ('created', 'edited', 'submitted', 'approved', 'refused', 'paid', 'unpaid', 'reassigned', 'imported'));

-- The kilometres a person drove for work in a year before using this tool
-- (moving here mid-year): they count in the year's distance, so the trips
-- entered here fall in the right band of the scale.
create table prior_distances (
  member_id text not null check (member_id ~ '^mbr_[a-z2-7]{26}$'),
  year integer not null check (year between 2000 and 2100),
  vehicle text not null check (vehicle in ('car', 'motorbike', 'moped')),
  distance_tenths integer not null check (distance_tenths between 0 and 10000000),
  updated_at timestamptz not null default now(),
  primary key (member_id, year, vehicle)
);

-- The vehicle's registration certificate (carte grise), which proves whose
-- car it is and its fiscal horsepower: uploaded by its owner, checked by an
-- accountant. A change of vehicle takes the check off.
alter table vehicles add column proof_object text unique;
alter table vehicles add column proof_name text check (proof_name is null or char_length(proof_name) <= 200);
alter table vehicles add column proof_type text;
alter table vehicles add column proof_sha256 text check (proof_sha256 is null or proof_sha256 ~ '^[0-9a-f]{64}$');
alter table vehicles add column checked_by text;
alter table vehicles add column checked_at timestamptz;
