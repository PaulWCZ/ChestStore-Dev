-- Company surveys and teams.
--
-- Who may start a company survey — one that repeats (a pulse) or asks
-- eNPS: organisers only, unless an admin opens it to members (lib/access.ts,
-- surveys; README, "Works council").
alter table settings add column members_surveys boolean not null default false;

-- An anonymous survey's counts per group of the Chest (Proposal (studio):
-- "groups": "read"), so its results may be read per team once it is closed
-- (lib/teams.ts: a group shows from 5 answers, and never when it could be
-- worked out from the others). Like tallies, these rows name nobody and
-- hold no time; they are rewritten with the poll's other anonymous rows in
-- one transaction, in a random order (lib/answers.ts). Only groups of at
-- least 5 members are counted.
create table group_tallies (
  poll_id bigint not null references polls on delete cascade,
  group_id text not null check (group_id ~ '^grp_[a-z2-7]{26}$'),
  question_id bigint not null references questions on delete cascade,
  key text not null check (key ~ '^(n|other|v([0-9]|10)|o[0-9]{1,18}(:[0-2])?)$'),
  count integer not null check (count >= 0),
  primary key (question_id, group_id, key)
);
create index group_tallies_poll on group_tallies (poll_id);
