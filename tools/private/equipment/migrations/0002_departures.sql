-- Departures told by People (Proposal (studio): events between tools): a
-- member whose last day HR set there, so the managers take back what they
-- hold before it. Only the member and the day, and when People said so (an
-- older word delivered late is ignored). A departure taken back keeps only
-- its member and time, for a week (last_day null). Forgotten once the last
-- day is 30 days past, or when the person leaves the Chest (from then on,
-- "Held by people who left" says the rest).
create table departures (
  member_id text primary key check (member_id ~ '^mbr_[a-z2-7]{26}$'),
  last_day date,
  told_at timestamptz not null
);
