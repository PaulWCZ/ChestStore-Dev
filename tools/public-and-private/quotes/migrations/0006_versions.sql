-- Versions of a sent quote. A quote that went to its client never changes
-- silently under the same number: changing it makes its next version
-- (D-2026-0007 v2), which goes to the client again. Each version sent is
-- kept as it was — its words, its lines, its totals and the PDF the client
-- was shown (in the Chest's files, with its SHA-256) — and stays readable
-- by the team and by the client who holds the link. An answer given online
-- names the version it was given on.

alter table documents add column version int not null default 1 check (version >= 1);

-- One row per version replaced: what the quote was when someone started
-- its next version. `fields` holds the quote's own columns to put back if
-- the new version is discarded before it is sent; `lines` its lines, as
-- the paper had them.
create table quote_versions (
  id bigint generated always as identity primary key,
  document_id bigint not null references documents (id),
  version int not null check (version >= 1),
  number text not null,
  issue_date date,
  valid_until date,
  sent_at timestamptz,
  sent_by text,
  emailed_to text,
  -- The quote's updated_at while this version was the one sent (the link's
  -- PDF is kept against it): put back when the next version is discarded.
  updated_at timestamptz not null,
  fields jsonb not null,
  lines jsonb not null,
  net bigint not null,
  gross bigint not null,
  currency text not null,
  pdf_object text,
  pdf_sha256 text,
  replaced_at timestamptz not null default now(),
  replaced_by text not null,
  unique (document_id, version)
);
create index quote_versions_by_pdf on quote_versions (pdf_sha256) where pdf_sha256 is not null;

-- The version an answer was given on (answers given before versions: 1).
alter table quote_answers add column version int not null default 1;
