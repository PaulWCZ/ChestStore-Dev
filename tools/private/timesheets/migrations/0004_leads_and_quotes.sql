-- After the third critique: a lead per project, and billable time handed to
-- the Quotes tool as a draft invoice (events between tools, a proposal).

-- The project's lead: a manager who hears of its budget and of the weeks
-- holding its time. Null: every manager, as before.
alter table projects add column lead_id text check (lead_id is null or lead_id ~ '^mbr_[a-z2-7]{26}$');
create index projects_lead on projects (lead_id) where lead_id is not null;

-- A hand-off: a project's billable time of a period, not invoiced, sent to
-- Quotes as the lines of a draft invoice (event "timesheets.billable",
-- version 1). Its entries point to it (entries.handoff_id) and are not sent
-- again while it stands. Quotes answers "quotes.invoiced" with the
-- hand-off's id: its entries are then invoiced. A manager may take a
-- hand-off back before that (event "timesheets.billable_cancelled").
create table handoffs (
  id bigint generated always as identity primary key,
  project_id bigint not null references projects (id),
  from_day date not null,
  to_day date not null check (to_day >= from_day),
  minutes integer not null check (minutes > 0),
  cents bigint,
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  entries integer not null check (entries > 0),
  sent_by text not null check (sent_by ~ '^mbr_[a-z2-7]{26}$' or sent_by = 'erased'),
  sent_at timestamptz not null default now(),
  -- Set once the Chest took the event; null while it failed (sent again with
  -- the same key, or taken back).
  published_at timestamptz,
  cancelled_at timestamptz,
  cancelled_by text check (cancelled_by is null or cancelled_by ~ '^mbr_[a-z2-7]{26}$' or cancelled_by = 'erased'),
  invoiced_at timestamptz,
  -- The invoice's number in Quotes ("F2026-014"), and its page there (a path
  -- of the Quotes tool, linked with chest.toolLink).
  invoice_ref text not null default '' check (char_length(invoice_ref) <= 60),
  invoice_path text not null default '' check (char_length(invoice_path) <= 300)
);
create index handoffs_project on handoffs (project_id, sent_at desc);

alter table entries add column handoff_id bigint references handoffs (id);
create index entries_handoff on entries (handoff_id) where handoff_id is not null;
