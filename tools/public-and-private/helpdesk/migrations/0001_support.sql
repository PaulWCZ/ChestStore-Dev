-- Support: tickets from customers (outside the company: an email address
-- and a name, never a member) and the team's answers. Agents are member ids
-- (mbr_…); 'erased' replaces one whose data was erased.

create table tickets (
  id bigint generated always as identity primary key,
  -- The number people say ("ticket 1042"), never reused.
  number integer not null unique,
  subject text not null check (char_length(subject) between 1 and 200),
  -- open: waiting on us; waiting: waiting on the customer; closed; spam.
  status text not null default 'open' check (status in ('open', 'waiting', 'closed', 'spam')),
  customer_email text not null check (char_length(customer_email) between 3 and 254),
  customer_name text not null default '' check (char_length(customer_name) <= 120),
  assignee text check (assignee ~ '^mbr_[a-z2-7]{26}$'),
  channel text not null check (channel in ('form', 'email', 'team')),
  -- The follow-up page's link: only its SHA-256 is kept.
  secret_hash text not null unique,
  language text not null default 'en' check (language ~ '^[a-z]{2}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz,
  search tsvector
);
create index tickets_status on tickets (status, updated_at desc);
create index tickets_assignee on tickets (assignee, status);
create index tickets_customer on tickets (lower(customer_email));
create index tickets_search on tickets using gin (search);
create sequence ticket_numbers start 1001;

create table messages (
  id bigint generated always as identity primary key,
  ticket_id bigint not null references tickets (id) on delete cascade,
  -- customer: from the customer; reply: sent to them; note: team only.
  kind text not null check (kind in ('customer', 'reply', 'note')),
  author text,
  body text not null check (char_length(body) between 1 and 50000),
  created_at timestamptz not null default now(),
  -- Email: the Message-ID it had (received or sent) for threading, and how
  -- a reply went out: sent, or not (no mail yet: on the follow-up page only).
  email_id text,
  delivery text check (delivery in ('email', 'page')),
  mail_id text
);
create index messages_ticket on messages (ticket_id, created_at);
create index messages_email on messages (email_id) where email_id is not null;

create table attachments (
  id bigint generated always as identity primary key,
  message_id bigint not null references messages (id) on delete cascade,
  object text not null unique,
  file_name text not null check (char_length(file_name) between 1 and 200),
  type text not null,
  size bigint not null
);
create index attachments_message on attachments (message_id);

create table saved_replies (
  id bigint generated always as identity primary key,
  title text not null check (char_length(title) between 1 and 80),
  body text not null check (char_length(body) between 1 and 5000),
  created_by text not null,
  created_at timestamptz not null default now()
);

-- Who has a ticket open right now (refreshed by their page every few
-- seconds): "Hugo is on this ticket".
create table viewing (
  ticket_id bigint not null references tickets (id) on delete cascade,
  member_id text not null,
  at timestamptz not null default now(),
  primary key (ticket_id, member_id)
);

-- The public form's counters (anti-abuse): by a hash of the visitor's
-- address and by the hour, and all visitors together.
create table form_counts (
  key text not null,
  hour timestamptz not null,
  count integer not null default 0,
  primary key (key, hour)
);

create table settings (
  key text primary key check (key ~ '^[a-z_]{1,40}$'),
  value jsonb not null
);

create table chest_events (
  id text primary key,
  handled_at timestamptz not null default now()
);
