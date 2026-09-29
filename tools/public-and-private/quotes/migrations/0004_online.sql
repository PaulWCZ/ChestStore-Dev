-- The client's answer online: a quote sent carries a secret link to the
-- tool's public part (/q/<secret>), where the client reads the quote and
-- accepts it ("Bon pour accord": their name, a tick, the date) or declines
-- it with a reason.

-- One link per quote at a time. The secret is kept so the person who sent
-- the quote can copy it again (the only thing it opens is this quote's
-- answer page); lookups go by its SHA-256. A revoked link never works
-- again; a new one may be made.
create table quote_links (
  id bigint generated always as identity primary key,
  document_id bigint not null references documents (id),
  secret text not null,
  secret_hash text not null unique,
  created_by text not null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_by text,
  -- The PDF the client is shown, kept in the Chest's files with its
  -- SHA-256, and the version of the quote it was drawn from (the quote's
  -- updated_at): drawn again when the quote changes.
  pdf_object text,
  pdf_sha256 text,
  pdf_of timestamptz
);
create unique index quote_links_live on quote_links (document_id) where revoked_at is null;

-- Each answer given online, kept as the proof of it: who typed their name,
-- when (the server's clock), from where (a hash of the address, never the
-- address), with what browser, and the exact PDF they were shown (its
-- SHA-256, and the file itself in the Chest's files).
create table quote_answers (
  id bigint generated always as identity primary key,
  document_id bigint not null references documents (id),
  link_id bigint not null references quote_links (id),
  answer text not null check (answer in ('accepted', 'refused')),
  name text not null,
  reason text not null default '',
  -- The day written next to "Bon pour accord" (the Chest's today).
  answered_on date not null,
  answered_at timestamptz not null default now(),
  visitor_hash text not null,
  user_agent text not null default '',
  language text not null default 'fr',
  number text,
  gross bigint not null,
  currency text not null,
  pdf_object text,
  pdf_sha256 text not null
);
create index quote_answers_by_document on quote_answers (document_id, answered_at);
