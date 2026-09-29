-- After the second critique (2026-09-29): the team view no longer blames
-- people for weeks before they started. A person's start is their first
-- entry, else the first day they opened the tool (kept here, once).
create table seen (
  member_id text primary key check (member_id ~ '^mbr_[a-z2-7]{26}$'),
  first_seen date not null
);
