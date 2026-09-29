-- Polls, fourth step: guests from outside the Chest on a date poll, and
-- the chosen date in each person's Chest calendar.

-- A date poll opened to people outside the Chest (a client, a candidate,
-- the accountant): anyone with this unguessable link may answer it on the
-- public host (lib/guests.ts). Null: members only. Turned off, the link
-- stops; turned on again, it is a new link. Named date polls only.
alter table polls add column guest_link text unique check (guest_link ~ '^[a-z2-7]{26}$');
alter table polls add constraint guests_on_dates check (guest_link is null or (kind = 'date' and not anonymous));

-- A guest's answer is a participant of its own: member 'guest', the name
-- they typed, their email if they gave one (to be told the chosen date),
-- the language of the page they answered in, and a hash of the secret
-- their browser keeps to change the answer (never the secret itself).
alter table participants drop constraint participants_member_check;
alter table participants add constraint participants_member_check check (member ~ '^mbr_[a-z2-7]{26}$' or member in ('erased', 'guest'));
alter table participants add column guest_name text check (char_length(guest_name) between 1 and 80);
alter table participants add column guest_email text check (char_length(guest_email) between 3 and 254);
alter table participants add column guest_locale text check (guest_locale ~ '^[a-z]{2}$');
alter table participants add column guest_key text unique check (guest_key ~ '^[0-9a-f]{64}$');
alter table participants add constraint guest_shape check ((member = 'guest') = (guest_name is not null and guest_key is not null and guest_locale is not null));
drop index participants_once;
create unique index participants_once on participants (poll_id, member) where member not in ('erased', 'guest');

-- The guest form's own counters when the Chest does not count visitors
-- (Proposal (studio): visitors): per visitor (a hash) and for everyone,
-- per hour. Old hours are deleted as new ones come.
create table guest_counts (
  key text not null check (char_length(key) <= 80),
  hour timestamptz not null,
  count integer not null check (count >= 0),
  primary key (key, hour)
);

-- What Polls learned of the Chest at its last try: whether it puts events
-- in its members' calendars (Proposal (studio): calendar). 'unknown' until
-- the first chosen date.
alter table settings add column calendar text not null default 'unknown' check (calendar in ('on', 'off', 'unknown'));

-- Replies to anonymous free texts (Officevibe's two-way feedback), once
-- an anonymous survey is closed (lib/replies.ts). The author of a free
-- text may have given, with it, the hash of a random key only their
-- browser keeps (reply_key): nothing else ties them to it. Those who
-- manage the poll reply under the text; the author, with the key, reads
-- the replies and answers back, still anonymous. A reply names its
-- writer ('anonymous' for the text's author) and holds no time: its id
-- orders the conversation. The text is found by its place (texts.shuffle,
-- fixed once the poll is closed: a closed anonymous poll never reopens).
alter table texts add column reply_key text check (reply_key ~ '^[0-9a-f]{64}$');
create table replies (
  id bigint generated always as identity primary key,
  poll_id bigint not null references polls on delete cascade,
  text_at double precision not null,
  author text not null check (author ~ '^mbr_[a-z2-7]{26}$' or author in ('erased', 'anonymous')),
  body text not null check (char_length(body) between 1 and 1000)
);
create index replies_poll on replies (poll_id, text_at, id);
create index replies_author on replies (author);
