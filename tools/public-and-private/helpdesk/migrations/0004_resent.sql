-- A request sent twice (a double tap, Back then Send again) is one ticket:
-- the second sending gets its own follow-up link to the same ticket, kept
-- here (hashed, like the first); it goes with the ticket.
create table ticket_links (
  secret_hash text primary key,
  ticket_id bigint not null references tickets (id) on delete cascade,
  created_at timestamptz not null default now()
);
create index ticket_links_by_ticket on ticket_links (ticket_id);
