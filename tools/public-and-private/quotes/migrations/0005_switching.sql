-- Switching day, and keeping the records.

-- Invoices imported from the previous tool, still to collect: they keep
-- their own numbers, in a series of their own ('imported'), outside this
-- tool's gap-free sequences. They were issued by the previous tool (its
-- PDF stays there), so they are never numbered, finalised, drawn, credited
-- nor sent here: only their payments and reminders are followed. They
-- carry no year nor place in a sequence, so continuing the numbering
-- (Settings) never counts them.
alter table documents drop constraint status_of_type;
alter table documents add constraint status_of_type check (
  (type = 'quote' and status in ('draft', 'sent', 'accepted', 'refused'))
  or (type = 'invoice' and status in ('draft', 'final', 'imported'))
  or (type = 'credit' and status in ('draft', 'final')));
alter table documents drop constraint numbered;
alter table documents add constraint numbered check (
  (status = 'imported' and number is not null and seq is null and year is null)
  or (status <> 'imported' and (number is null) = (seq is null) and (number is null) = (year is null)));
-- An imported number may be one this tool gives later (the previous tool
-- used the same format): the two series never collide; each is unique on
-- its own.
drop index documents_by_number;
create unique index documents_by_number on documents (type, number) where number is not null and status <> 'imported';
create unique index documents_imported_number on documents (number) where status = 'imported';
-- The import that brought it (undone together, while nothing was recorded
-- on them).
alter table documents add column import_batch text;
create index documents_by_import on documents (import_batch) where import_batch is not null;

-- A finalised document is frozen, and so is an imported one: only what
-- happens after it may change (its reminders), and an import may be undone
-- (deleted) while nothing was recorded on it (checked by the tool).
create or replace function frozen_document() returns trigger language plpgsql as $$
declare
  mutable text[] := array['sent_at', 'sent_by', 'emailed_to', 'reminded_at', 'reminders', 'updated_at', 'created_by', 'finalised_by', 'ready_at', 'pdf_object', 'pdf_sha256', 'pdf_format'];
begin
  if old.type = 'invoice' and old.status = 'imported' then
    if tg_op = 'DELETE' then
      return old;
    end if;
    if (to_jsonb(new) - mutable) is distinct from (to_jsonb(old) - mutable)
      or (new.created_by is distinct from old.created_by and new.created_by <> 'erased')
      or new.pdf_object is not null or new.finalised_by is not null then
      raise exception 'frozen: an imported invoice cannot be changed' using errcode = 'QF001';
    end if;
    return new;
  end if;
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

-- The monthly archive: on the first days of a month, the month before —
-- its invoices' and credit notes' PDFs of record, the summary, the
-- accounting entries, the clients and the catalogue — as one ZIP (or a few
-- parts, each under the Chest's size of a file sent at once) kept in the
-- Chest's files. Someone who exports is asked on the desk to keep a copy
-- outside the Chest until one of them downloaded it.
create table archives (
  period text not null check (period ~ '^[0-9]{4}-[0-9]{2}$'),
  part int not null default 1 check (part >= 1),
  parts int not null default 1 check (parts >= 1),
  object text,
  sha256 text,
  size bigint not null default 0,
  documents int not null default 0,
  made_at timestamptz not null default now(),
  downloaded_at timestamptz,
  downloaded_by text,
  primary key (period, part)
);
