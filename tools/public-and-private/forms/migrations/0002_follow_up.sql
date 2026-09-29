-- Forms, second step: following up answers, telling people by email,
-- telling other tools, a cover picture, and the tool's own settings.

-- An answer to a named form can be followed up: new, in progress, done,
-- with a note. On a team form the person who sent it sees both ("what I
-- sent"). Anonymous answers are never followed up (nothing to say to whom).
alter table answers add column status text not null default 'new' check (status in ('new', 'doing', 'done'));
alter table answers add column note text not null default '' check (char_length(note) <= 2000);
alter table answers add column handled_at timestamptz;
create index answers_status on answers (form_id, status) where deleted_at is null;

-- The people told of new answers (watchers) also get them by email, in the
-- same batches as the bell (Proposal (studio): mail). mailed_at: the time of
-- the last answer an email already carried.
alter table forms add column notify_email boolean not null default false;
alter table forms add column mailed_at timestamptz;

-- Each answer is told to the tools of the Chest an admin linked to Forms
-- (Proposal (studio): events between tools, "forms.answered"). Never for an
-- anonymous form.
alter table forms add column share_events boolean not null default false;
alter table forms add constraint anonymous_no_events check (not anonymous or not share_events);

-- A cover picture at the top of the respondent's page: an object the tool
-- published under public/covers/ (Proposal (studio): files.publicFiles),
-- {object, version}.
alter table forms add column cover jsonb check (cover is null or jsonb_typeof(cover) = 'object');

-- The tool's own settings, one row per key (the websites allowed to show
-- the public forms in a frame).
create table settings (
  key text primary key,
  value jsonb not null
);
