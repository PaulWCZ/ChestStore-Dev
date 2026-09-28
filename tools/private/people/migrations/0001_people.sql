-- People: what the Chest does not know about the people who have the tool.
-- Names, photos and who is in the company come from the Chest (members);
-- this database keeps only the directory's extra fields, the checklist
-- templates and the onboardings/offboardings started from them. People are
-- member ids (mbr_…), never names; 'erased' replaces the id of a person
-- whose data was erased.

-- One row per person who has something more than their name. A person who
-- leaves is kept 30 days (left_at), then purged; a manager is a member id.
create table profiles (
  member_id text primary key check (member_id ~ '^mbr_[a-z2-7]{26}$'),
  title text not null default '' check (char_length(title) <= 80),
  team text not null default '' check (char_length(team) <= 60),
  office text not null default '' check (char_length(office) <= 60),
  manager_id text check (manager_id ~ '^mbr_[a-z2-7]{26}$' and manager_id <> member_id),
  phone text not null default '' check (char_length(phone) <= 30),
  pronouns text not null default '' check (char_length(pronouns) <= 30),
  bio text not null default '' check (char_length(bio) <= 600),
  skills text[] not null default '{}' check (cardinality(skills) <= 12),
  start_date date,
  -- Day and month only ("MM-DD"), and only when the person chose to show it.
  birthday text check (birthday ~ '^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$'),
  left_at timestamptz,
  updated_at timestamptz not null default now()
);
create index profiles_manager on profiles (manager_id) where manager_id is not null;

-- Checklist templates: "Office newcomer" (onboarding), "Leaving"
-- (offboarding). Each item goes to a role, resolved when a checklist starts:
-- 'person' (the newcomer, or the person leaving), 'manager' (their
-- manager), 'hr' (whoever starts it), 'member' (a named member). Its day is
-- counted from the start date (or the last day), negative before it.
create table templates (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('onboarding', 'offboarding')),
  name text not null check (char_length(name) between 1 and 80),
  created_by text not null,
  created_at timestamptz not null default now(),
  archived_at timestamptz
);

create table template_items (
  id bigint generated always as identity primary key,
  template_id bigint not null references templates (id) on delete cascade,
  position integer not null,
  text text not null check (char_length(text) between 1 and 200),
  role text not null check (role in ('person', 'manager', 'hr', 'member')),
  member_id text check (member_id ~ '^mbr_[a-z2-7]{26}$'),
  offset_days integer not null default 0 check (offset_days between -90 and 365),
  check ((role = 'member') = (member_id is not null))
);
create index template_items_template on template_items (template_id, offset_days, position);
create index template_items_member on template_items (member_id) where member_id is not null;

-- An onboarding or offboarding of one person: a copy of a template's items,
-- each given to someone and due on a day. Stopped ones are kept (undo) until
-- deleted from the list.
create table journeys (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('onboarding', 'offboarding')),
  person_id text not null check (person_id ~ '^mbr_[a-z2-7]{26}$' or person_id = 'erased'),
  template_id bigint references templates (id) on delete set null,
  name text not null check (char_length(name) between 1 and 80),
  -- The first day (onboarding) or the last day (offboarding).
  anchor date not null,
  created_by text not null,
  created_at timestamptz not null default now(),
  stopped_at timestamptz,
  completed_at timestamptz
);
create index journeys_person on journeys (person_id);

create table journey_items (
  id bigint generated always as identity primary key,
  journey_id bigint not null references journeys (id) on delete cascade,
  position integer not null,
  text text not null check (char_length(text) between 1 and 200),
  role text not null check (role in ('person', 'manager', 'hr', 'member')),
  -- Who does it; null when nobody could be named (no manager yet, someone
  -- who left): HR gives it to someone.
  assignee text check (assignee ~ '^mbr_[a-z2-7]{26}$' or assignee = 'erased'),
  due_on date not null,
  done_at timestamptz,
  done_by text,
  removed_at timestamptz
);
create index journey_items_journey on journey_items (journey_id, due_on, position);
create index journey_items_assignee on journey_items (assignee) where done_at is null and removed_at is null;

-- The Chest's lifecycle events already handled (delivered at least once).
create table chest_events (
  id text primary key,
  handled_at timestamptz not null default now()
);
