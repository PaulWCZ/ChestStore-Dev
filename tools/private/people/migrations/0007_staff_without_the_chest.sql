-- Staff without the Chest (a warehouse worker, an intern) in the directory
-- and the org chart: their HR record is the only place they exist, so it
-- carries what the directory shows of them — their team and their manager
-- (a member) — and whether HR lists them there at all (yes by default:
-- they work here). The directory shows their name, their job, their team
-- and their manager, marked "Not in the Chest"; nothing else of the
-- record. Once the record is linked to a member, the member's profile
-- takes over (the team and manager fill its empty fields).
alter table records
  add column listed boolean not null default true,
  add column team text not null default '' check (char_length(team) <= 60),
  add column manager_id text check (manager_id ~ '^mbr_[a-z2-7]{26}$');
create index records_offline on records (lower(legal_name), id) where member_id is null and erased_at is null and listed;
