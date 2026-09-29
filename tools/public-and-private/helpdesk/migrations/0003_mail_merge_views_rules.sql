-- Email in and out, merging, saved views, rules on arrival, ratings, and
-- who erased what. Version 0.2 keeps working on this
-- schema: every new column has a default or may be null, the new kind
-- ('event') is only written by the new version.

-- A received email: its sender (a colleague of the customer may answer on
-- the thread), the HTML the Chest cleaned, the original message (an object
-- of the tool's files, downloaded only), the attachments the Chest did not
-- keep, whether it was an automatic answer (out of office: it never
-- reopens a ticket). A sent one: its bounce, if it came back.
alter table messages add column mail_from text check (char_length(mail_from) <= 254);
alter table messages add column html text check (char_length(html) <= 2097152);
alter table messages add column original text;
alter table messages add column dropped jsonb not null default '[]';
alter table messages add column auto boolean not null default false;
alter table messages add column bounce jsonb;
-- Merging moves messages; they remember where they came from (undo).
alter table messages add column merged_from bigint;
-- 'event': something that happened (a merge), said in the reader's language.
alter table messages drop constraint messages_kind_check;
alter table messages add constraint messages_kind_check check (kind in ('customer', 'reply', 'note', 'event'));
create index messages_mail on messages (mail_id) where mail_id is not null;

-- Merged into another ticket (closed, its link and its thread lead there).
alter table tickets add column merged_into bigint references tickets (id) on delete set null;
-- The confirmation email sent when it opened, and the last bounce of an
-- email sent about it: "emails to this address do not arrive".
alter table tickets add column confirm_mail_id text;
alter table tickets add column confirm_email_id text;
create index tickets_confirm on tickets (confirm_email_id) where confirm_email_id is not null;
alter table tickets add column bounce jsonb;
-- The customer's one-click opinion after it closed.
alter table tickets add column rating text check (rating in ('good', 'bad'));
alter table tickets add column rated_at timestamptz;

-- Views the team saved: a name and the inbox's address parameters.
create table saved_views (
  id bigint generated always as identity primary key,
  name text not null check (char_length(name) between 1 and 40),
  params jsonb not null,
  created_by text not null,
  created_at timestamptz not null default now()
);

-- Rules on arrival: when a new request's subject or message contains a
-- text, or it comes from an address or a domain, set a tag, a priority,
-- someone.
create table rules (
  id bigint generated always as identity primary key,
  field text not null check (field in ('text', 'from')),
  value text not null check (char_length(value) between 1 and 100),
  tag text check (char_length(tag) between 1 and 30),
  priority text check (priority in ('low', 'normal', 'high', 'urgent')),
  assignee text check (assignee ~ '^mbr_[a-z2-7]{26}$'),
  created_by text not null,
  created_at timestamptz not null default now(),
  check (tag is not null or priority is not null or assignee is not null)
);

-- Who erased a customer's data, and when (never whose: the address is gone).
create table erasures (
  id bigint generated always as identity primary key,
  by_member text not null,
  tickets integer not null,
  at timestamptz not null default now()
);
