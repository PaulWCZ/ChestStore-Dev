-- Rooms on SDK 0.4.1-studio.5 (the owner's mail decisions of 6 October
-- 2026).
--
-- Members are never mailed by a tool: the guests of a room booking hear of
-- it in their bell (which the Chest mails them, by their own choice) and
-- in their calendar. What the tool remembered of its guests' emails goes.
alter table settings drop column mail;
alter table settings drop column mail_tried;

-- A visitor is someone outside the company: they may get an invitation by
-- email (the "mail" proposal), with the time, the office's address and a
-- calendar file. Their address is optional, given by whoever announces
-- the visit, seen by nobody in the pages, and erased once the day of the
-- visit is over (lib/settings.ts purge) — the visit itself goes later, with
-- the visitors' rule.
--   email: where the invitation goes (null: none asked, or erased);
--   language: the language the invitation was written in (the announcer's),
--     so that a cancellation reads the same;
--   invitation: 'sent' (the Chest took it), 'not_sent' (it could not: no
--     mail on this Chest, paused, the day's emails spent, the address
--     refused) — null when no address was given;
--   mail_sequence: how many invitations or cancellations went (the
--     calendar file's SEQUENCE, and each message's key).
alter table visits add column email text check (email is null or (char_length(email) between 3 and 254 and email !~ '\s'));
alter table visits add column language text not null default 'en' check (language ~ '^[a-z]{2}$');
alter table visits add column invitation text check (invitation in ('sent', 'not_sent'));
alter table visits add column mail_sequence integer not null default 0 check (mail_sequence >= 0);
