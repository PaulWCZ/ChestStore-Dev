-- Switching from another invoicing tool, and what it did that this one did
-- not: continuing its numbering, the Factur-X copy of record, automatic
-- payment reminders, recurring invoices, the accountant's entries.

-- Numbers with the year (F-2026-0001, from 0001 each year) or without it
-- (F-0001, never restarting). A sequence "without the year" is kept in the
-- counters under the year 0.
alter table company add column number_format text not null default 'yearly' check (number_format in ('yearly', 'continuous'));

-- Every change of the numbering an administrator made: the format, or the
-- next number of a sequence continued from the previous tool (only
-- forward, only before this tool numbered anything in it).
create table numbering_changes (
  id bigint generated always as identity primary key,
  type text check (type is null or type in ('quote', 'invoice', 'credit')),
  period int,
  next int check (next is null or next >= 1),
  number_format text check (number_format is null or number_format in ('yearly', 'continuous')),
  changed_by text not null,
  changed_at timestamptz not null default now(),
  constraint one_change check ((type is not null and period is not null and next is not null and number_format is null)
    or (type is null and period is null and next is null and number_format is not null))
);

-- A link to pay online (a payment page of the company's bank, Stripe,
-- GoCardless…), printed on invoices and in their emails.
alter table company add column payment_link text not null default '';

-- Reminders of late invoices, sent by the tool itself (off until an
-- administrator turns them on): the days after the due date, and whether
-- the client is emailed (when the Chest can send email) or only the person
-- in charge is told in the bell.
alter table company add column reminders_on boolean not null default false;
alter table company add column reminder_days int[] not null default '{7,15,30}';
alter table company add column reminders_email boolean not null default true;
-- The last day the morning's follow-up ran (reminders, recurring drafts):
-- without the Chest's schedules, the first visit of the day runs it.
alter table company add column followed_up_on date;

-- The accounts of the accountant's entries (journal code, client, sales,
-- deposits, VAT per rate), as {"journal": "VE", "client": "411", …}.
alter table company add column accounts jsonb not null default '{}';

-- A client's own account code in the books (the auxiliary account of 411),
-- as the previous tool or the accountant named it.
alter table clients add column account text not null default '';

-- The automatic reminders done: one per invoice and step, never twice.
create table reminder_steps (
  document_id bigint not null references documents (id),
  step int not null,
  channel text not null check (channel in ('email', 'bell', 'none')),
  done_at timestamptz not null default now(),
  primary key (document_id, step)
);

-- Recurring invoices: an issued invoice made again every month, quarter or
-- year, as a draft handed to billing on its day (never finalised by
-- itself).
create table repeats (
  id bigint generated always as identity primary key,
  source_id bigint not null references documents (id),
  every text not null check (every in ('month', 'quarter', 'year')),
  -- The first draft's day; each next one is counted from it (the 31st
  -- stays the last day of shorter months).
  starts_on date not null,
  next_on date not null,
  active boolean not null default true,
  made int not null default 0,
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index repeats_by_source on repeats (source_id) where active;
alter table documents add column repeat_id bigint references repeats (id);
create index documents_by_repeat on documents (repeat_id) where repeat_id is not null;

-- A line that takes back a deposit invoice (the final invoice of a quote):
-- its deposit invoice, so the accountant's entries clear the deposit.
alter table lines add column deposit_of bigint references documents (id);

-- The format of an issued document's PDF of record: 'factur-x' when it is
-- a Factur-X (PDF/A-3 carrying its EN 16931 data, factur-x.xml), 'pdf'
-- before this version. Set once, with the stored PDF — so the guard of
-- finalised documents lets it through once, like pdf_object.
alter table documents add column pdf_format text check (pdf_format is null or pdf_format in ('pdf', 'factur-x'));

create or replace function frozen_document() returns trigger language plpgsql as $$
declare
  mutable text[] := array['sent_at', 'sent_by', 'emailed_to', 'reminded_at', 'reminders', 'updated_at', 'created_by', 'finalised_by', 'ready_at', 'pdf_object', 'pdf_sha256', 'pdf_format'];
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
      or (old.pdf_sha256 is not null and new.pdf_sha256 is distinct from old.pdf_sha256)
      or (old.pdf_format is not null and new.pdf_format is distinct from old.pdf_format) then
      raise exception 'frozen: a finalised % cannot be changed', old.type using errcode = 'QF001';
    end if;
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end $$;

-- The documents issued before: their stored PDF is a plain PDF.
update documents set pdf_format = 'pdf' where pdf_object is not null;
