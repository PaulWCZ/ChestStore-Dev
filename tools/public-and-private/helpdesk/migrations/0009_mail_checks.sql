-- The owner's mail decisions (6 October 2026): the Chest receives no mail
-- and posts no bounce. Support learns whether an email it sent arrived by
-- asking the Chest (mail.status): each email sent — a confirmation, a
-- reply — is listed here until it is delivered, bounced, or three days old
-- (src/lib/mail-checks.ts); rows go after a week. Only the Chest's message
-- id is kept, never an address.
--
-- What the earlier version wrote for received emails stays where it is,
-- for that version to keep working on this schema (a rollback does not
-- undo a migration): messages.mail_from, html, original, dropped, auto,
-- email_id and tickets.confirm_email_id are no longer written nor read
-- (an original's file is still deleted with its ticket). They can go in a
-- later migration, once no version that reads them can come back.
create table mail_checks (
  mail_id text primary key check (char_length(mail_id) <= 64),
  sent_at timestamptz not null default now(),
  checked_at timestamptz,
  done boolean not null default false
);
create index mail_checks_due on mail_checks (sent_at) where not done;
