-- Time handed over by Timesheets (Proposal (studio): events between
-- tools): one row per hand-off, forever — a second delivery of the same
-- hand-off changes nothing, even after its draft was dropped. The draft
-- invoice it made (null once dropped), where it came from in Timesheets,
-- the client's name as Timesheets wrote it (when none matched here), and
-- whether Timesheets was told the invoice was issued (quotes.invoiced).
create table handoffs (
  handoff text primary key check (handoff ~ '^[1-9][0-9]{0,17}$'),
  document_id bigint references documents (id) on delete set null,
  project text not null,
  period_from date,
  period_to date,
  source_path text not null default '',
  client_name text not null default '',
  received_at timestamptz not null default now(),
  cancelled_at timestamptz,
  published_at timestamptz
);
create unique index handoffs_by_document on handoffs (document_id) where document_id is not null;
