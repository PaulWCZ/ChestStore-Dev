-- Tags, priority, and how long a customer has waited for an answer.
-- Version 0.1 keeps working on this schema: every new column has a default
-- or may be null, and it never reads the new tables.

-- low, normal (the default), high, urgent: said in words on every screen.
alter table tickets add column priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent'));

-- Since when the customer waits for an answer: their first message the
-- team has not answered yet; null once the team replies. Shown on open
-- tickets only ("waiting 3 h").
alter table tickets add column waiting_since timestamptz;

update tickets t set waiting_since = (
  select min(m.created_at) from messages m
  where m.ticket_id = t.id and m.kind = 'customer'
    and m.created_at > coalesce((select max(r.created_at) from messages r where r.ticket_id = t.id and r.kind = 'reply'), '-infinity')
) where t.status = 'open';

create index tickets_waiting on tickets (status, waiting_since);

-- A short list shared by the team: created on the fly by those who answer,
-- renamed or deleted by an administrator. Names are unique, whatever their
-- case.
create table tags (
  id bigint generated always as identity primary key,
  name text not null check (char_length(name) between 1 and 30),
  created_at timestamptz not null default now()
);
create unique index tags_name on tags (lower(name));

create table ticket_tags (
  ticket_id bigint not null references tickets (id) on delete cascade,
  tag_id bigint not null references tags (id) on delete cascade,
  primary key (ticket_id, tag_id)
);
create index ticket_tags_tag on ticket_tags (tag_id);
