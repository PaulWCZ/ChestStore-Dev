-- Timed next steps in each person's Chest calendar (Proposal (studio): the
-- calendar bridge), and the names the sample data seeds as keys.

-- What this tool put in the Chest's calendar: one event per open next step
-- with a time of day, on its owner's calendar. The fingerprint says whether
-- the step changed since (its words, day, time, owner, what it is about);
-- a step done, deleted, without a time or without an owner takes its
-- event out. No reference to steps: a deleted step's row is how the tool
-- knows to remove its event.
create table step_events (
  step_id bigint primary key,
  owner text not null,
  fingerprint text not null,
  put_at timestamptz not null default now()
);

-- Whether the Chest took the last event (null: never tried): the step form
-- says "in your Chest calendar" only where it works.
create table tool_state (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

-- A field the tool offers under a name of its catalogue (the sample's
-- "Competitor"): shown in each reader's language until someone renames it
-- (then label, as typed). Its choices likewise: option_keys[i] names
-- options[i] (the stored value), shown in the reader's language.
alter table fields add column label_key text check (label_key is null or label_key ~ '^[a-z][a-zA-Z]{0,39}$');
alter table fields add column option_keys text[] not null default '{}';
