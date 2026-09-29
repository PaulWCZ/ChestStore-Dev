-- Clients, deepened: the team's own fields on companies, contacts and deals;
-- imports recorded (so one can be undone); a company's structured address,
-- SIREN and VAT number; a second phone and a web address on contacts; phone
-- numbers searchable whatever their spacing; several next steps per deal or
-- contact, with an optional time, and next steps of one's own; files on
-- deals, companies and contacts (the Chest's files); merging duplicates.
-- The previous version keeps working on this schema: every new column has a
-- default, nothing it reads was removed.

-- phone: a number as search compares it — digits only, "+33 (0)4…" and
-- "0033 4…" written as the French "04…". Immutable: it feeds stored columns.
create function crm_phone(value text) returns text
  language sql immutable parallel safe strict
  as $$
    select case
      when v ~ '^\s*\+\s*33' then '0' || substr(regexp_replace(v, '[^0-9]', '', 'g'), 3)
      when v ~ '^\s*0033' then '0' || substr(regexp_replace(v, '[^0-9]', '', 'g'), 5)
      else regexp_replace(v, '[^0-9]', '', 'g')
    end
    from (select regexp_replace(value, '\(\s*0\s*\)', '', 'g') as v) x
  $$;

-- The team's own fields (a manager sets them): a label, a kind, the choices
-- of a "choice" field. Values live on each record, in `custom`, keyed by
-- the field's id: a text, a number, a day (YYYY-MM-DD) or one of the
-- choices. Removing a field removes its values (lib/fields.ts).
create table fields (
  id bigint generated always as identity primary key,
  object text not null check (object in ('companies', 'contacts', 'deals')),
  label text not null check (char_length(label) between 1 and 60),
  kind text not null check (kind in ('text', 'number', 'date', 'choice')),
  options text[] not null default '{}' check (cardinality(options) <= 50),
  position int not null default 0,
  created_at timestamptz not null default now()
);
create unique index fields_label on fields (object, lower(label));

-- Each import, so that what it added can be taken back for a day.
create table imports (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('contacts', 'companies', 'deals', 'activities', 'vcard')),
  file_name text not null default '' check (char_length(file_name) <= 200),
  author text not null,
  report jsonb not null default '{}',
  created_at timestamptz not null default now(),
  undone_at timestamptz
);
create index imports_author on imports (author, created_at desc);

alter table companies
  add column postcode text not null default '' check (char_length(postcode) <= 20),
  add column city text not null default '' check (char_length(city) <= 80),
  add column country text not null default '' check (char_length(country) <= 80),
  add column siren text not null default '' check (siren ~ '^([0-9]{9}|[0-9]{14})?$'),
  add column vat text not null default '' check (vat ~ '^([A-Z]{2}[0-9A-Z]{2,13})?$'),
  add column email text not null default '' check (char_length(email) <= 254),
  add column custom jsonb not null default '{}',
  add column import_id bigint references imports (id) on delete set null;
alter table companies add column phone_digits text generated always as (crm_phone(phone)) stored;
create index companies_phone on companies using gin (phone_digits gin_trgm_ops);
create index companies_import on companies (import_id) where import_id is not null;

alter table contacts
  add column phone2 text not null default '' check (char_length(phone2) <= 40),
  add column url text not null default '' check (char_length(url) <= 200),
  add column custom jsonb not null default '{}',
  add column import_id bigint references imports (id) on delete set null;
alter table contacts add column phone_digits text generated always as (crm_phone(phone) || ' ' || crm_phone(phone2)) stored;
create index contacts_phone on contacts using gin (phone_digits gin_trgm_ops);
create index contacts_import on contacts (import_id) where import_id is not null;

alter table deals
  add column custom jsonb not null default '{}',
  add column import_id bigint references imports (id) on delete set null;
create index deals_import on deals (import_id) where import_id is not null;

-- What happened: two more kinds the tool records ('merged': a duplicate was
-- merged into this record), and history brought by an import.
alter table activities drop constraint activities_kind_check;
alter table activities add constraint activities_kind_check check (kind in ('call', 'meeting', 'email', 'note', 'step', 'created', 'stage', 'won', 'lost', 'reopened', 'owner', 'unassigned', 'merged'));
alter table activities add column import_id bigint references imports (id) on delete set null;
create index activities_import on activities (import_id) where import_id is not null;

-- Next steps: several open ones per deal or contact, an optional time of
-- day ("14:30", in the Chest's time zone), and steps of one's own attached
-- to nothing ("prepare the trade show").
drop index steps_one_open_deal;
drop index steps_one_open_contact;
alter table steps drop constraint steps_check;
alter table steps add constraint steps_one_anchor check (deal_id is null or contact_id is null);
alter table steps
  add column due_time text check (due_time is null or due_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  add column import_id bigint references imports (id) on delete set null;
create index steps_deal_open on steps (deal_id) where done_at is null;
create index steps_contact_open on steps (contact_id) where done_at is null;

-- Files on a deal, a company or a contact: the bytes are in the Chest's
-- files (capability "files"), named by the Chest; here, what the page
-- lists. Deleting the record deletes these rows; the service deletes the
-- objects (lib/attachments.ts).
create table attachments (
  id bigint generated always as identity primary key,
  deal_id bigint references deals (id) on delete cascade,
  company_id bigint references companies (id) on delete cascade,
  contact_id bigint references contacts (id) on delete cascade,
  object text not null unique,
  file_name text not null check (char_length(file_name) between 1 and 200),
  type text not null check (char_length(type) <= 120),
  size bigint not null check (size >= 0),
  added_by text not null,
  added_at timestamptz not null default now(),
  check (num_nonnulls(deal_id, company_id, contact_id) = 1)
);
create index attachments_deal on attachments (deal_id);
create index attachments_company on attachments (company_id);
create index attachments_contact on attachments (contact_id);
