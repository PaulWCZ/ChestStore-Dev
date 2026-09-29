-- Goals, after the critique: who may see an objective, a trace of every
-- change to a key result's measure, email preferences and reminders sent,
-- and key results fed by the CRM (Proposal (studio): events between tools).
-- Member ids only ("mbr_…"), 'erased' for an erased person.

-- A unit may be written "customer/customers": one form for 1, one for more.
alter table key_results drop constraint key_results_unit_check;
alter table key_results add constraint key_results_unit_check check (char_length(unit) <= 41);

-- Who sees an objective: everyone (the default), its team only (a team
-- that is a group of the Chest), or some people. Its owner, the owners of
-- its key results and the admins always see it.
alter table objectives add column visibility text not null default 'everyone' check (visibility in ('everyone', 'team', 'people'));
create table objective_viewers (
  objective_id bigint not null references objectives (id) on delete cascade,
  member_id text not null,
  primary key (objective_id, member_id)
);
create index objective_viewers_member on objective_viewers (member_id);

-- What changed in a key result after it was written, by whom: a target
-- lowered in week 10 is never silent.
create table key_result_changes (
  id bigint generated always as identity primary key,
  key_result_id bigint not null references key_results (id) on delete cascade,
  field text not null check (field in ('title', 'kind', 'unit', 'start', 'target', 'weight', 'owner')),
  before text not null default '' check (char_length(before) <= 200),
  after text not null default '' check (char_length(after) <= 200),
  author text not null,
  created_at timestamptz not null default now()
);
create index key_result_changes_key_result on key_result_changes (key_result_id, created_at);

-- Each person's choice: the Friday reminder and nudges by email too (on
-- unless they turn it off).
create table preferences (
  member_id text primary key,
  email_off boolean not null default false,
  updated_at timestamptz not null default now()
);

-- A nudge ("Remind") sent to someone waiting for a check-in: at most one a
-- day per person, whoever asks.
create table nudges (
  member_id text not null,
  day date not null,
  sent_by text not null,
  at timestamptz not null default now(),
  primary key (member_id, day)
);

-- A key result fed by the CRM: the amount won, or the number of deals won,
-- in the cycle's dates. The CRM tells each deal won or reopened (events
-- crm.deal.won / crm.deal.reopened, once an admin linked the two tools).
alter table key_results add column source text check (source in ('crm.won_amount', 'crm.won_count'));
create table crm_deals (
  deal text primary key check (char_length(deal) between 1 and 64),
  amount_cents bigint,
  currency text check (currency ~ '^[A-Z]{3}$'),
  owner text,
  won_at timestamptz,          -- null once reopened
  updated_at timestamptz not null default now()
);
create index crm_deals_won on crm_deals (won_at) where won_at is not null;
