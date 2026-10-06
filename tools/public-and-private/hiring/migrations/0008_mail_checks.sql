-- The owner's mail decisions (6 October 2026): the Chest receives no mail
-- and posts no bounce. Hiring learns whether an email to a candidate
-- arrived by asking the Chest (mail.status): each email sent is listed here
-- until it is delivered, bounced, or three days old (src/lib/outbox.ts,
-- checkSent); rows go after a week. Only the Chest's message id is kept.
--
-- What the earlier version wrote for received emails (messages with
-- direction 'in', their html, original, from_address, received_id,
-- in_reply_to, authenticated) stays where it is, for that version to keep
-- working on this schema (a rollback does not undo a migration). This
-- version neither writes nor shows them; their files are still deleted
-- with their candidate. They can go in a later migration.
create table mail_checks (
  mail_id text primary key check (char_length(mail_id) <= 64),
  sent_at timestamptz not null default now(),
  checked_at timestamptz,
  done boolean not null default false
);
create index mail_checks_due on mail_checks (sent_at) where not done;
