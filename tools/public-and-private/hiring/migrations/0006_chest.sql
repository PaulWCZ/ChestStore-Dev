-- Hiring, sixth step: the store's tool package (@argentic/chest-app).
--
-- chest_seen: what the Chest delivered already (events, schedule runs,
-- received emails: each comes at least once) and the public forms' tokens
-- already used (each serves once). The ids chest_events kept are copied
-- in, so a delivery handled before is still recognised.
-- chest_bounds: what a public action counted today, per visitor and for
-- everyone (publicAction's bound: applying, sending a CV, choosing an
-- interview time).
--
-- chest_events (0001) and form_counts (0001) are no longer written; they
-- stay for the previous version, and go in a later step.
create table chest_seen (
  id text primary key,
  at timestamptz not null default now()
);
insert into chest_seen (id, at) select id, handled_at from chest_events on conflict do nothing;

create table chest_bounds (
  scope text not null,
  visitor text not null,
  day date not null,
  count integer not null,
  primary key (scope, visitor, day)
);
