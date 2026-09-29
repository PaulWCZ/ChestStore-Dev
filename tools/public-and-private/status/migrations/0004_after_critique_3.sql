-- After critique round 3: services in two languages, subscriptions in a
-- chat (Slack, Teams) or at a web address, and what Status tells the other
-- tools of the Chest.

-- A service's name and description are written in `language` (null for
-- rows made before: read as the Chest's language), with an optional
-- second version in the tool's other language — like an incident's texts.
alter table components add column language text check (language is null or language ~ '^[a-z]{2}$');
alter table components add column name_second text check (name_second is null or char_length(name_second) between 1 and 80);
alter table components add column description_second text check (description_second is null or char_length(description_second) <= 200);

-- Updates delivered by the Chest (Proposal (studio): webhooks) to a Slack
-- or Teams channel, or to any https address (JSON signed by the Chest), a
-- visitor gave on "Get updates". The Chest keeps the address (encrypted,
-- never shown whole again) and delivers; the tool keeps the target's id,
-- the address as the Chest shows it (without its secret part), the
-- language of the messages and what is followed. The token opens the
-- subscription's own page (its link is shown once, like a password).
create table hook_subscribers (
  id bigint generated always as identity primary key,
  target text not null unique check (target ~ '^whk_[a-z2-7]{26}$'),
  kind text not null check (kind in ('slack', 'teams', 'generic')),
  shown text not null default '' check (char_length(shown) <= 300),
  language text not null default 'en' check (language ~ '^[a-z]{2}$'),
  components bigint[],
  token text not null unique check (char_length(token) = 32),
  -- A generic receiver's secret key, shown once on the subscription's
  -- page right after it was made, then forgotten.
  secret_once text check (secret_once is null or char_length(secret_once) <= 100),
  created_at timestamptz not null default now(),
  -- The Chest stopped delivering (webhook.disabled): when, and why.
  disabled_at timestamptz,
  last_error text check (last_error is null or char_length(last_error) <= 200)
);

-- What waits to be handed to the Chest, one per subscription and update:
-- queued inside the update's transaction (announce), sent right after it
-- and by the "updates" schedule.
create table hook_queue (
  id bigint generated always as identity primary key,
  hook_subscriber_id bigint not null references hook_subscribers (id) on delete cascade,
  update_id bigint not null references updates (id) on delete cascade,
  created_at timestamptz not null default now(),
  attempts integer not null default 0,
  unique (hook_subscriber_id, update_id)
);
