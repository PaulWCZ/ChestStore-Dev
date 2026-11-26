-- What @argentic/chest-app keeps for the public part (the client's answer
-- page, /q/<secret>): the form tokens already served (chest_seen; Quotes'
-- own deliveries stay in chest_events, 0001), and what a bounded public
-- action counted today, per visitor and in all ("*"): chest_bounds. Rows
-- older than yesterday are removed as it goes.
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
