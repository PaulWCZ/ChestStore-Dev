-- Posts from everyone, and shout-outs.
--
-- A shout-out thanks a colleague: a fifth kind of post. Its colleague is
-- kept where a welcome keeps the new colleague (posts.welcome, now "the
-- colleague the post is about"), so their name, photo, erasure and export
-- follow the same rules.
--
-- Any member may propose a post — a shout-out or a piece of news — which
-- waits for a publisher (proposals). Nobody but its author and the
-- publishers sees a proposal; once a publisher approves it, it becomes a
-- post signed by its author (approved_by says who let it through) and the
-- proposal row goes. A declined proposal stays 30 days (Undo), then goes.
--
-- The previous version keeps working on this schema: the new kind is only
-- written by this version, the new columns are optional.
alter table posts drop constraint posts_kind_check;
alter table posts add constraint posts_kind_check check (kind in ('announcement', 'event', 'welcome', 'shoutout', 'info'));
alter table posts drop constraint welcome_fields;
alter table posts add constraint welcome_fields check ((kind in ('welcome', 'shoutout')) = (welcome is not null));
alter table posts add column approved_by text check (approved_by is null or approved_by ~ '^mbr_[a-z2-7]{26}$' or approved_by = 'erased');

create table proposals (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('shoutout', 'info')),
  title text not null check (char_length(title) between 1 and 140),
  body text not null default '' check (char_length(body) <= 5000),
  locale text not null check (locale ~ '^[a-z]{2}$'),
  author text not null check (author ~ '^mbr_[a-z2-7]{26}$'),
  -- A shout-out: the colleague thanked.
  colleague text check (colleague is null or colleague ~ '^mbr_[a-z2-7]{26}$' or colleague = 'erased'),
  created_at timestamptz not null default now(),
  declined_at timestamptz,
  declined_by text check (declined_by is null or declined_by ~ '^mbr_[a-z2-7]{26}$' or declined_by = 'erased'),
  -- Why, in a few words, for its author (optional).
  reason text check (reason is null or char_length(reason) <= 300),
  constraint proposal_colleague check ((kind = 'shoutout') = (colleague is not null)),
  constraint proposal_declined check ((declined_at is null) = (declined_by is null))
);
create index proposals_waiting on proposals (created_at) where declined_at is null;
create index proposals_author on proposals (author);
create index proposals_colleague on proposals (colleague) where colleague is not null;

-- A proposal's picture: a file of its author's, kept for the proposal
-- (never purged as an unused upload while it waits), the post's cover
-- once approved.
alter table files add column proposal_id bigint references proposals (id) on delete set null;
create index files_proposal on files (proposal_id) where proposal_id is not null;
