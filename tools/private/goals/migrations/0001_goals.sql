-- Goals: cycles, teams, objectives, key results, weekly check-ins,
-- comments. Member ids ("mbr_…") only, never a name or an address; 'erased'
-- stands for a person whose data was erased (see lib/lifecycle.ts).

create table settings (
  id boolean primary key default true check (id),
  personal boolean not null default false,          -- personal objectives allowed
  updated_by text,
  updated_at timestamptz not null default now()
);
insert into settings (id) values (true);

-- A cycle: a quarter, usually. At most one is current.
create table cycles (
  id bigint generated always as identity primary key,
  name text not null check (char_length(name) between 1 and 60),
  starts_on date not null,
  ends_on date not null,
  current boolean not null default false,
  closed_at timestamptz,
  closed_by text,
  created_by text not null,
  created_at timestamptz not null default now(),
  check (ends_on > starts_on)
);
create unique index cycles_one_current on cycles (current) where current;

-- A team: a group of the Chest (its name read live) or a name of the
-- tool's own when the company has no such group.
create table teams (
  id bigint generated always as identity primary key,
  name text not null check (char_length(name) between 1 and 60),
  group_id text check (group_id ~ '^grp_[a-z2-7]{26}$'),
  archived_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index teams_group on teams (group_id) where group_id is not null;

create table objectives (
  id bigint generated always as identity primary key,
  cycle_id bigint not null references cycles (id) on delete cascade,
  level text not null check (level in ('company', 'team', 'personal')),
  team_id bigint references teams (id),
  parent_id bigint references objectives (id) on delete set null,
  owner text not null,
  title text not null check (char_length(title) between 1 and 200),
  why text not null default '' check (char_length(why) <= 2000),
  position integer not null default 0,
  carried_from bigint references objectives (id) on delete set null,
  -- The retrospective, once the cycle ends: a score from 0 to 1 and what
  -- the team learned.
  score numeric(3, 2) check (score between 0 and 1),
  learned text not null default '' check (char_length(learned) <= 2000),
  retro_by text,
  retro_at timestamptz,
  created_by text not null,
  created_at timestamptz not null default now(),
  archived_at timestamptz,
  check ((level = 'team') = (team_id is not null))
);
create index objectives_cycle on objectives (cycle_id) where archived_at is null;
create index objectives_owner on objectives (owner);
create index objectives_parent on objectives (parent_id);

create table key_results (
  id bigint generated always as identity primary key,
  objective_id bigint not null references objectives (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  kind text not null check (kind in ('number', 'percent', 'money', 'milestone')),
  unit text not null default '' check (char_length(unit) <= 20),
  currency text check (currency ~ '^[A-Z]{3}$'),
  start_value numeric(16, 4) not null default 0,
  target_value numeric(16, 4) not null,
  current_value numeric(16, 4) not null default 0,
  weight smallint not null default 1 check (weight between 1 and 3),
  owner text not null,
  position integer not null default 0,
  created_by text not null,
  created_at timestamptz not null default now(),
  archived_at timestamptz,
  check (start_value <> target_value)
);
create index key_results_objective on key_results (objective_id) where archived_at is null;
create index key_results_owner on key_results (owner) where archived_at is null;

-- A check-in: the value that week, how sure its owner is, a line. Never
-- edited; the latest can be taken back by its author for a while.
create table check_ins (
  id bigint generated always as identity primary key,
  key_result_id bigint not null references key_results (id) on delete cascade,
  value numeric(16, 4) not null,
  confidence text not null check (confidence in ('on_track', 'at_risk', 'off_track')),
  note text not null default '' check (char_length(note) <= 500),
  author text not null,
  created_at timestamptz not null default now()
);
create index check_ins_key_result on check_ins (key_result_id, created_at desc);

create table comments (
  id bigint generated always as identity primary key,
  objective_id bigint not null references objectives (id) on delete cascade,
  author text not null,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  deleted_at timestamptz
);
create index comments_objective on comments (objective_id, created_at);

-- Members who left or lost access: their objectives and key results wait
-- for a new owner (lib/lifecycle.ts).
create table departed (
  member_id text primary key,
  at timestamptz not null default now()
);

-- The ids of the Chest's events already handled.
create table chest_events (
  id text primary key,
  at timestamptz not null default now()
);
