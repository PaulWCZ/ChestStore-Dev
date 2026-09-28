-- Who is away (Proposal (studio): events between tools — Leave's approved
-- and cancelled leaves). Only the dates and halves of a leave, the member,
-- the request's reference in Leave and when Leave said so: never the kind
-- of leave nor its note. Forgotten once its last day is past, or when the
-- person leaves the Chest. A cancelled leave keeps only its reference and
-- time, for a week, so an approval delivered late cannot bring it back.
create table away (
  request text primary key check (request ~ '^[A-Za-z0-9._:-]{1,60}$'),
  member_id text not null check (member_id ~ '^mbr_[a-z2-7]{26}$'),
  from_day date,
  to_day date,
  -- 'pm': from noon on the first day; 'am': until noon on the last day.
  from_half text not null default 'day' check (from_half in ('am', 'pm', 'day')),
  to_half text not null default 'day' check (to_half in ('am', 'pm', 'day')),
  told_at timestamptz not null,
  cancelled boolean not null default false,
  check (cancelled or (from_day is not null and to_day is not null and to_day >= from_day))
);
create index away_member on away (member_id, to_day) where not cancelled;
