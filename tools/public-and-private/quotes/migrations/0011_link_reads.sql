-- How often a quote's link handed out its files (its PDF, the terms) in
-- an hour: whoever holds the link, from however many browsers, gets so
-- many an hour (src/lib/downloads.ts). Rows older than a day are removed
-- as it goes.
create table link_reads (
  link_id bigint not null references quote_links (id),
  hour timestamptz not null,
  count integer not null,
  primary key (link_id, hour)
);
