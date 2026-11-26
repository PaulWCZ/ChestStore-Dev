-- Support, eighth step: the package's guard of the public part
-- (@argentic/chest-app 0.1.0-studio.3, publicAction's bound).
--
-- chest_bounds counts a public action's calls a day, per visitor (the
-- address the Chest's front gives, else the browser's cookie) and for
-- everyone; chest_seen keeps the form tokens already used (each serves
-- once). form_counts now counts only what a follow-up link does, per
-- request and per hour (src/lib/tickets.ts, linkGuard); its rows per
-- visitor are no longer written and go with the day. The public address
-- is the Chest's word only (chest.tool.publicUrl): the one once
-- remembered from a request's Host is forgotten.
create table chest_bounds (
  scope text not null,
  visitor text not null,
  day date not null,
  count integer not null,
  primary key (scope, visitor, day)
);

create table chest_seen (
  id text primary key,
  at timestamptz not null default now()
);

delete from settings where key = 'public_origin';
