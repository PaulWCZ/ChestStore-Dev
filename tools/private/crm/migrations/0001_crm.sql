-- Clients: companies, the people who work there (contacts), deals moving
-- through the stages of one pipeline, what happened (activities) and what
-- comes next (next steps). People of the team are member ids (mbr_…), never
-- names; an owner may be null ("unassigned", after someone left); 'erased'
-- replaces the id of a person whose data was erased. Contacts are people
-- outside the company: deleting one deletes it for good, with what was
-- written about them (lib/contacts.ts).

-- Search in any language, accents aside ("fevrier" finds "Février"), and
-- names that look alike (duplicates). Both extensions are trusted: the
-- database's owner may create them.
create extension if not exists unaccent;
create extension if not exists pg_trgm;
create text search configuration crm (copy = simple);
alter text search configuration crm alter mapping for hword, hword_part, word with unaccent, simple;

-- fold: a name as search compares it, lower case and without accents. The
-- dictionary is named in full so the function means the same whatever the
-- search path; declared immutable (unaccent's rules do not change under a
-- running database) so that it may feed stored columns and indexes.
create function crm_fold(value text) returns text
  language sql immutable parallel safe strict
  as $$ select lower(public.unaccent('public.unaccent'::regdictionary, value)) $$;

-- The stages of the pipeline, in order. 'open' stages are where deals
-- move; 'won' and 'lost' are the two end stages, one of each, always there.
-- A default stage has a key and no name: each reader sees it in their own
-- language; a name given by a manager replaces it for everyone.
create table stages (
  id bigint generated always as identity primary key,
  key text check (key is null or key ~ '^[a-z]{1,20}$'),
  name text check (name is null or char_length(name) between 1 and 40),
  kind text not null default 'open' check (kind in ('open', 'won', 'lost')),
  probability int not null check (probability between 0 and 100),
  position text collate "C" not null,
  archived_at timestamptz,
  check (key is not null or name is not null)
);
create unique index stages_one_won on stages (kind) where kind in ('won', 'lost');
insert into stages (key, kind, probability, position) values
  ('lead', 'open', 10, 'a'),
  ('qualified', 'open', 25, 'c'),
  ('proposal', 'open', 50, 'e'),
  ('negotiation', 'open', 75, 'g'),
  ('won', 'won', 100, 'w'),
  ('lost', 'lost', 0, 'y');

create table companies (
  id bigint generated always as identity primary key,
  name text not null check (char_length(name) between 1 and 160),
  website text not null default '' check (char_length(website) <= 200),
  phone text not null default '' check (char_length(phone) <= 40),
  address text not null default '' check (char_length(address) <= 300),
  industry text not null default '' check (char_length(industry) <= 80),
  notes text not null default '' check (char_length(notes) <= 5000),
  tags text[] not null default '{}' check (cardinality(tags) <= 20),
  owner text check (owner is null or owner ~ '^mbr_[a-z2-7]{26}$' or owner = 'erased'),
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  folded text generated always as (crm_fold(name)) stored,
  search tsvector generated always as (
    setweight(to_tsvector('crm', name), 'A') ||
    setweight(to_tsvector('crm', website || ' ' || industry), 'B') ||
    setweight(to_tsvector('crm', address || ' ' || notes), 'C')
  ) stored
);
create index companies_search on companies using gin (search);
create index companies_folded on companies using gin (folded gin_trgm_ops);
create index companies_owner on companies (owner);
create index companies_tags on companies using gin (tags);

create table contacts (
  id bigint generated always as identity primary key,
  name text not null check (char_length(name) between 1 and 160),
  email text not null default '' check (char_length(email) <= 254),
  phone text not null default '' check (char_length(phone) <= 40),
  title text not null default '' check (char_length(title) <= 120),
  company_id bigint references companies (id) on delete set null,
  notes text not null default '' check (char_length(notes) <= 5000),
  tags text[] not null default '{}' check (cardinality(tags) <= 20),
  owner text check (owner is null or owner ~ '^mbr_[a-z2-7]{26}$' or owner = 'erased'),
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- The last time this person was in touch (a call, a meeting, an email):
  -- the CNIL's prospect rule counts three years from it.
  last_contact_at timestamptz,
  folded text generated always as (crm_fold(name)) stored,
  search tsvector generated always as (
    setweight(to_tsvector('crm', name), 'A') ||
    setweight(to_tsvector('crm', email || ' ' || title), 'B') ||
    setweight(to_tsvector('crm', notes), 'C')
  ) stored
);
create index contacts_search on contacts using gin (search);
create index contacts_folded on contacts using gin (folded gin_trgm_ops);
create index contacts_email on contacts (lower(email)) where email <> '';
create index contacts_company on contacts (company_id);
create index contacts_owner on contacts (owner);
create index contacts_tags on contacts using gin (tags);

create table deals (
  id bigint generated always as identity primary key,
  title text not null check (char_length(title) between 1 and 160),
  company_id bigint references companies (id) on delete set null,
  contact_id bigint references contacts (id) on delete set null,
  -- Money in whole cents of the currency (EUR today): never a float.
  value_cents bigint not null default 0 check (value_cents between 0 and 100000000000),
  currency text not null default 'EUR' check (currency ~ '^[A-Z]{3}$'),
  stage_id bigint not null references stages (id),
  position text collate "C" not null,
  expected_close date,
  owner text check (owner is null or owner ~ '^mbr_[a-z2-7]{26}$' or owner = 'erased'),
  -- Why it was won or lost, said when it was.
  reason text not null default '' check (char_length(reason) <= 300),
  closed_at timestamptz,
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  search tsvector generated always as (to_tsvector('crm', title)) stored,
  folded text generated always as (crm_fold(title)) stored
);
create index deals_stage on deals (stage_id, position);
create index deals_owner on deals (owner);
create index deals_company on deals (company_id);
create index deals_contact on deals (contact_id);
create index deals_search on deals using gin (search);
create index deals_folded on deals using gin (folded gin_trgm_ops);

-- What happened: a call, a meeting, an email, a note written by someone, or
-- what the tool records by itself (created, stage, won, lost, owner, step
-- done). Anchored on a deal, a contact and/or a company: an activity on a
-- deal also carries its company and contact, so each page's timeline is
-- one query.
create table activities (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('call', 'meeting', 'email', 'note', 'step', 'created', 'stage', 'won', 'lost', 'reopened', 'owner', 'unassigned')),
  body text not null default '' check (char_length(body) <= 5000),
  data jsonb not null default '{}',
  -- Deleting a company or a contact deletes what was logged only on them
  -- first (lib/companies.ts, lib/contacts.ts); what was logged on a deal
  -- goes with the deal.
  company_id bigint references companies (id) on delete set null,
  contact_id bigint references contacts (id) on delete set null,
  deal_id bigint references deals (id) on delete cascade,
  author text not null,
  at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  -- Removed by a person: kept a day for "Undo", then purged (lib/morning.ts).
  removed_at timestamptz,
  check (company_id is not null or contact_id is not null or deal_id is not null)
);
create index activities_company on activities (company_id, at desc);
create index activities_contact on activities (contact_id, at desc);
create index activities_deal on activities (deal_id, at desc);
create index activities_author on activities (author);

-- What comes next, on a deal or on a contact: at most one open step each.
-- Done, it becomes an activity ('step') and is kept here with done_at.
create table steps (
  id bigint generated always as identity primary key,
  deal_id bigint references deals (id) on delete cascade,
  contact_id bigint references contacts (id) on delete cascade,
  text text not null check (char_length(text) between 1 and 200),
  due_on date not null,
  owner text check (owner is null or owner ~ '^mbr_[a-z2-7]{26}$' or owner = 'erased'),
  created_by text not null,
  created_at timestamptz not null default now(),
  done_at timestamptz,
  check ((deal_id is null) <> (contact_id is null))
);
create unique index steps_one_open_deal on steps (deal_id) where done_at is null and deal_id is not null;
create unique index steps_one_open_contact on steps (contact_id) where done_at is null and contact_id is not null;
create index steps_owner_due on steps (owner, due_on) where done_at is null;

-- The Chest's lifecycle events already handled (they come at least once).
create table chest_events (
  id text primary key,
  handled_at timestamptz not null default now()
);
