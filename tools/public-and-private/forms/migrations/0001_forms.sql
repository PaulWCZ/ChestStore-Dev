-- Forms: forms, their published versions, who shares them, and the
-- answers. People are member ids (mbr_…), never names or addresses.
--
-- A form has a working draft (forms.draft) and immutable published
-- versions (versions). An answer names the version it answered, so a form
-- edited after it was published never changes what older answers mean.
--
-- Anonymous team forms (forms.anonymous): an answer holds no member id and
-- no time finer than its month; who has answered is in participants, a
-- table never joined to the answers. Each anonymous answer rewrites the
-- form's answers and participants in a random order (lib/answers.ts), so
-- neither order nor row stamps say which answer came last.

create table forms (
  id bigint generated always as identity primary key,
  -- The public address: /<slug> on the public host, /chest/f/<slug> for a team form.
  slug text not null unique check (slug ~ '^[a-z0-9]{8}$'),
  owner text not null check (owner ~ '^mbr_[a-z2-7]{26}$' or owner = 'erased'),
  status text not null default 'draft' check (status in ('draft', 'published', 'closed')),
  audience text not null default 'public' check (audience in ('public', 'team')),
  anonymous boolean not null default false,
  -- One answer per member (team forms; always for anonymous ones).
  once boolean not null default true,
  -- Tell everyone who has the tool when a team form opens (bell).
  tell_team boolean not null default false,
  layout text not null default 'steps' check (layout in ('steps', 'classic')),
  accent text not null default 'berry' check (accent in ('berry', 'indigo', 'teal', 'tangerine', 'forest', 'ink')),
  -- The builder's working copy, and a counter of its saves (two editors
  -- never overwrite each other silently).
  draft jsonb not null check (jsonb_typeof(draft) = 'object'),
  revision integer not null default 1,
  -- The latest published version (0: never published).
  version integer not null default 0,
  closes_at timestamptz,
  max_answers integer check (max_answers between 1 and 100000),
  thanks_title text not null default '' check (char_length(thanks_title) <= 120),
  thanks_body text not null default '' check (char_length(thanks_body) <= 1000),
  redirect_url text check (redirect_url ~ '^https://' and char_length(redirect_url) <= 2000),
  send_copy boolean not null default false,
  retention_months integer check (retention_months in (1, 3, 6, 12, 24, 36)),
  -- Answers taken (the limit is checked against it in the same statement
  -- that counts a new one).
  answer_count integer not null default 0 check (answer_count >= 0),
  -- The bell: when the last batch was sent, and whether answers wait for the next one.
  bell_at timestamptz,
  bell_pending boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz,
  closed_at timestamptz,
  deleted_at timestamptz,
  constraint anonymous_is_team check (not anonymous or audience = 'team'),
  constraint anonymous_once check (not anonymous or once),
  constraint anonymous_no_copy check (not anonymous or not send_copy)
);
create index forms_owner on forms (owner) where deleted_at is null;

create table versions (
  form_id bigint not null references forms on delete cascade,
  version integer not null check (version >= 1),
  definition jsonb not null check (jsonb_typeof(definition) = 'object'),
  published_at timestamptz not null default now(),
  primary key (form_id, version)
);

-- People a form is shared with, besides its owner.
create table access (
  form_id bigint not null references forms on delete cascade,
  member text not null check (member ~ '^mbr_[a-z2-7]{26}$'),
  level text not null check (level in ('editor', 'viewer')),
  primary key (form_id, member)
);
create index access_member on access (member);

-- People told of new answers, and how many they have not seen.
create table watchers (
  form_id bigint not null references forms on delete cascade,
  member text not null check (member ~ '^mbr_[a-z2-7]{26}$'),
  unseen integer not null default 0 check (unseen >= 0),
  primary key (form_id, member)
);
create index watchers_member on watchers (member);

create table answers (
  -- Random: an id says nothing about when or in which order.
  id text primary key check (id ~ '^[a-z0-9]{16}$'),
  form_id bigint not null references forms on delete cascade,
  version integer not null,
  -- The member who answered a named team form; null otherwise.
  respondent text check (respondent ~ '^mbr_[a-z2-7]{26}$'),
  -- The first email address given in the answer, lowercased: to find a
  -- person's answers when they ask for them to be erased. Null when anonymous.
  email text check (char_length(email) <= 254),
  data jsonb not null check (jsonb_typeof(data) = 'object'),
  -- Null for an anonymous answer, which keeps only its month.
  created_at timestamptz,
  month date not null,
  language text not null default 'en' check (language ~ '^[a-z]{2}$'),
  deleted_at timestamptz,
  foreign key (form_id, version) references versions on delete cascade
);
create index answers_form on answers (form_id, created_at desc nulls last) where deleted_at is null;
create index answers_respondent on answers (respondent) where respondent is not null;
create index answers_email on answers (email) where email is not null;
create index answers_month on answers (form_id, month);

-- Who answered an anonymous form (no time, no order: rewritten at each
-- answer). After an erasure the member reads 'erased' (counted, unnamed).
create table participants (
  form_id bigint not null references forms on delete cascade,
  member text not null check (member ~ '^mbr_[a-z2-7]{26}$' or member = 'erased')
);
create unique index participants_once on participants (form_id, member) where member <> 'erased';
create index participants_member on participants (member);

-- The public forms' counters when the Chest cannot count visitors
-- (Proposal (studio): visitors): one row per key and hour, kept a day.
create table form_counts (
  key text not null,
  hour timestamptz not null,
  count integer not null default 0,
  primary key (key, hour)
);

-- The events of the members' lifecycle already handled (events.handle):
-- the Chest delivers at least once.
create table chest_events (
  id text primary key,
  handled_at timestamptz not null default now()
);
