-- Quotes & invoices: the company's legal details, clients, the catalogue,
-- quotes, invoices and credit notes with their lines, payments, and the
-- numbering counters. Money in minor units (cents), quantities in
-- thousandths, percentages and VAT rates in hundredths of a percent.

-- The seller: one row, printed on every document (frozen into each
-- document when it is numbered).
create table company (
  id int primary key default 1 check (id = 1),
  legal_name text not null default '',
  trade_name text not null default '',
  legal_form text not null default '',
  capital bigint check (capital is null or capital >= 0),
  address text not null default '',
  postcode text not null default '',
  city text not null default '',
  country text not null default 'FR',
  siren text not null default '',
  siret text not null default '',
  rcs_city text not null default '',
  vat_number text not null default '',
  vat_regime text not null default 'standard' check (vat_regime in ('standard', 'franchise')),
  vat_on_debits boolean not null default false,
  email text not null default '',
  phone text not null default '',
  website text not null default '',
  bank text not null default '',
  iban text not null default '',
  bic text not null default '',
  logo_object text,
  logo_type text,
  payment_days int not null default 30 check (payment_days between 0 and 120),
  validity_days int not null default 30 check (validity_days between 1 and 365),
  -- Late-payment penalties, hundredths of a percent a year; null: the
  -- legal default (the ECB's refinancing rate plus 10 points).
  penalty_rate int check (penalty_rate is null or penalty_rate between 0 and 10000),
  early_discount text not null default '',
  quote_prefix text not null default 'D',
  invoice_prefix text not null default 'F',
  credit_prefix text not null default 'A',
  footer text not null default '',
  -- Whether the Chest could send the last email (null: never tried).
  mail_works boolean,
  updated_by text,
  updated_at timestamptz
);
insert into company (id) values (1);

create table clients (
  id bigint generated always as identity primary key,
  kind text not null default 'company' check (kind in ('company', 'person')),
  name text not null,
  contact text not null default '',
  email text not null default '',
  phone text not null default '',
  address text not null default '',
  postcode text not null default '',
  city text not null default '',
  country text not null default 'FR',
  delivery_address text not null default '',
  siren text not null default '',
  vat_number text not null default '',
  language text not null default 'fr',
  reverse_charge boolean not null default false,
  notes text not null default '',
  -- The hook for the CRM tool (Clients): its reference of this company,
  -- once events between tools link the two (README, "Needs from the SDK").
  external_ref text,
  archived_at timestamptz,
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index clients_by_name on clients (lower(name));
create unique index clients_by_external_ref on clients (external_ref) where external_ref is not null;

create table items (
  id bigint generated always as identity primary key,
  name text not null,
  description text not null default '',
  unit text not null default '',
  unit_price bigint not null default 0,
  vat_rate int not null default 2000 check (vat_rate between 0 and 10000),
  goods boolean not null default false,
  archived_at timestamptz,
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index items_by_name on items (lower(name));

create table documents (
  id bigint generated always as identity primary key,
  type text not null check (type in ('quote', 'invoice', 'credit')),
  status text not null default 'draft',
  constraint status_of_type check (
    (type = 'quote' and status in ('draft', 'sent', 'accepted', 'refused'))
    or (type <> 'quote' and status in ('draft', 'final'))),
  number text,
  year int,
  seq int,
  client_id bigint references clients (id),
  title text not null default '',
  language text not null default 'fr',
  currency text not null default 'EUR',
  -- Set when the document is numbered (a quote sent, an invoice finalised).
  issue_date date,
  -- The day of the sale or of the end of the service, when it is not the
  -- issue date.
  delivery_date date,
  valid_until date,
  due_date date,
  payment_days int not null default 30,
  vat_treatment text not null default 'standard' check (vat_treatment in ('standard', 'reverse_charge')),
  franchise boolean not null default false,
  notes text not null default '',
  quote_id bigint references documents (id),
  deposit_percent int check (deposit_percent is null or deposit_percent between 1 and 10000),
  invoice_id bigint references documents (id),
  net bigint not null default 0,
  vat bigint not null default 0,
  gross bigint not null default 0,
  rates jsonb not null default '[]',
  -- The seller and the buyer as they were when the document was numbered.
  seller jsonb,
  buyer jsonb,
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  ready_at timestamptz,
  sent_at timestamptz,
  sent_by text,
  emailed_to text,
  decided_at timestamptz,
  decided_by text,
  finalised_at timestamptz,
  finalised_by text,
  reminded_at timestamptz,
  reminders int not null default 0,
  pdf_object text,
  pdf_sha256 text,
  deleted_at timestamptz,
  constraint numbered check ((number is null) = (seq is null) and (number is null) = (year is null)),
  constraint final_is_numbered check (status = 'draft' or number is not null),
  constraint one_sequence unique (type, year, seq)
);
create unique index documents_by_number on documents (type, number) where number is not null;
create index documents_by_type on documents (type, status) where deleted_at is null;
create index documents_by_client on documents (client_id);
create index documents_by_date on documents (issue_date);
create index documents_by_quote on documents (quote_id) where quote_id is not null;
create index documents_by_invoice on documents (invoice_id) where invoice_id is not null;

create table lines (
  id bigint generated always as identity primary key,
  document_id bigint not null references documents (id) on delete cascade,
  position int not null,
  kind text not null check (kind in ('line', 'section')),
  item_id bigint references items (id) on delete set null,
  description text not null default '',
  quantity bigint not null default 1000,
  unit text not null default '',
  unit_price bigint not null default 0,
  discount int not null default 0 check (discount between 0 and 10000),
  vat_rate int not null default 2000 check (vat_rate between 0 and 10000),
  goods boolean not null default false,
  net bigint not null default 0,
  constraint one_position unique (document_id, position)
);

create table payments (
  id bigint generated always as identity primary key,
  document_id bigint not null references documents (id),
  paid_on date not null,
  amount bigint not null check (amount > 0),
  method text not null,
  note text not null default '',
  created_by text not null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index payments_by_document on payments (document_id) where deleted_at is null;

-- The last number given, per kind of document and year. Numbering takes
-- this row's lock inside the transaction that numbers the document: two
-- finalisations wait for each other, and a transaction that fails gives its
-- number back — the sequence has no gap.
create table counters (
  type text not null,
  year int not null,
  last int not null default 0,
  primary key (type, year)
);

-- The events of the members' lifecycle already handled.
create table chest_events (
  id text primary key,
  handled_at timestamptz not null default now()
);

-- A finalised invoice or credit note is a legal record: kept as it was
-- issued, never deleted. Only what happens after it may change: when it was
-- sent and to whom, its reminders, its stored PDF (once), and the members'
-- ids replaced by 'erased' on an erasure. Payments live in their own table.
create function frozen_document() returns trigger language plpgsql as $$
declare
  mutable text[] := array['sent_at', 'sent_by', 'emailed_to', 'reminded_at', 'reminders', 'updated_at', 'created_by', 'finalised_by', 'ready_at', 'pdf_object', 'pdf_sha256'];
begin
  if old.type in ('invoice', 'credit') and old.status = 'final' then
    if tg_op = 'DELETE' then
      raise exception 'frozen: a finalised % is kept', old.type using errcode = 'QF001';
    end if;
    if (to_jsonb(new) - mutable) is distinct from (to_jsonb(old) - mutable) then
      raise exception 'frozen: a finalised % cannot be changed', old.type using errcode = 'QF001';
    end if;
    if (new.created_by is distinct from old.created_by and new.created_by <> 'erased')
      or (new.finalised_by is distinct from old.finalised_by and new.finalised_by <> 'erased')
      or (old.pdf_object is not null and new.pdf_object is distinct from old.pdf_object)
      or (old.pdf_sha256 is not null and new.pdf_sha256 is distinct from old.pdf_sha256) then
      raise exception 'frozen: a finalised % cannot be changed', old.type using errcode = 'QF001';
    end if;
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end $$;
create trigger documents_frozen before update or delete on documents for each row execute function frozen_document();

create function frozen_lines() returns trigger language plpgsql as $$
declare
  doc bigint;
begin
  if tg_op = 'INSERT' then
    doc := new.document_id;
  else
    doc := old.document_id;
  end if;
  if exists (select 1 from documents where id = doc and type in ('invoice', 'credit') and status = 'final')
    or (tg_op = 'UPDATE' and exists (select 1 from documents where id = new.document_id and type in ('invoice', 'credit') and status = 'final')) then
    raise exception 'frozen: the lines of a finalised document cannot be changed' using errcode = 'QF001';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end $$;
create trigger lines_frozen before insert or update or delete on lines for each row execute function frozen_lines();
