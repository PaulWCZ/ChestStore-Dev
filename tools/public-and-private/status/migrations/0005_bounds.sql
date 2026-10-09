-- The public forms' bounds (@argentic/chest-app's publicAction({ bound })):
-- the single-use form tokens and what the Chest delivered already
-- (chest_seen), and what a public action counted today, per visitor and in
-- all ("*") (chest_bounds). The tool's own counters (form_counts) are no
-- longer written; the table stays for the version before this one (both
-- run during a switch), and a later migration may drop it.
create table chest_seen (
  id text primary key,
  at timestamptz not null default now()
);
create table chest_bounds (
  scope text not null,
  visitor text not null,
  day date not null,
  count integer not null,
  primary key (scope, visitor, day)
);

-- How many confirmation emails went to an address today: three at most,
-- whoever asks for them.
alter table subscribers add column confirm_day date, add column confirm_sends integer not null default 0;
