-- Notices to the team's chat (Proposal (studio): webhooks): an
-- administrator gives the address of a Slack or Teams channel (or of any
-- receiver: Zapier, Make, the company's own server) and what to tell it —
-- a new request, a customer writing again, a request waiting too long.
-- The Chest keeps the address (encrypted, never shown whole again) and
-- delivers; the tool keeps only its id and the choices.
create table notice_targets (
  id text primary key check (id ~ '^whk_[a-z2-7]{26}$'),
  kind text not null check (kind in ('slack', 'teams', 'generic')),
  label text not null check (char_length(label) between 1 and 80),
  -- The address as the Chest shows it (without its secret part).
  shown text not null default '' check (char_length(shown) <= 300),
  events text[] not null check (cardinality(events) between 1 and 3 and events <@ array['new', 'replied', 'late']::text[]),
  created_by text not null,
  created_at timestamptz not null default now(),
  -- The Chest stopped delivering (webhook.disabled): when, and why.
  disabled_at timestamptz,
  last_error text check (char_length(last_error) <= 200)
);

-- A request waiting too long is noticed once per wait: the wait it was
-- noticed for (a reply ends the wait; the next one may be noticed again).
alter table tickets add column late_noticed_for timestamptz;

-- Incidents Status publishes ("status.incident", version 1, Proposal
-- (studio): events between tools): while one is open, the inbox says so
-- and a saved reply links its public page. Only what Status made public.
create table incidents (
  source_id text primary key check (source_id ~ '^[0-9]{1,18}$'),
  -- {"en": "Payments unavailable", "fr": "Paiement indisponible"}: the
  -- title in each language it was written in.
  titles jsonb not null,
  language text not null check (language ~ '^[a-z]{2}$'),
  services jsonb not null default '[]',
  impact text not null check (impact in ('degraded', 'partial', 'major', 'maintenance', 'operational')),
  status text not null check (status in ('investigating', 'identified', 'monitoring', 'resolved', 'removed')),
  -- The incident's public page, as Status gave it (https only).
  url text check (url is null or (url ~ '^https?://' and char_length(url) <= 500)),
  started_at timestamptz not null,
  -- The time of the update the event told (events may arrive out of order).
  at timestamptz not null,
  received_at timestamptz not null default now()
);
create index incidents_open on incidents (at desc) where status not in ('resolved', 'removed');
