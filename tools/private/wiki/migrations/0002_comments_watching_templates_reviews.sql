-- Talking about a page, following it, starting from a model, keeping it
-- true. People are member ids (mbr_…); 'erased' replaces the id of a person
-- whose data was erased.

-- Comments at the bottom of a page: plain text (links are found when
-- shown). Removing one keeps it an hour, for Undo; then it goes for good.
create table page_comments (
  id bigint generated always as identity primary key,
  page_id bigint not null references pages (id) on delete cascade,
  author text not null,
  body text not null check (char_length(body) between 1 and 5000),
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  removed_at timestamptz
);
create index page_comments_page on page_comments (page_id, created_at, id);
create index page_comments_author on page_comments (author);
create index page_comments_removed on page_comments (removed_at) where removed_at is not null;

-- Who follows a page: told in the Chest's bell when someone else saves it
-- or comments on it.
create table page_watchers (
  page_id bigint not null references pages (id) on delete cascade,
  member_id text not null check (member_id ~ '^mbr_[a-z2-7]{26}$'),
  since timestamptz not null default now(),
  primary key (page_id, member_id)
);
create index page_watchers_member on page_watchers (member_id);

-- A page of a space its editors offer as a model for new pages there.
alter table pages add column template boolean not null default false;
create index pages_templates on pages (space_id) where template and deleted_at is null;

-- Checking a page now and then: every 3, 6 or 12 months its owner (who set
-- the reminder) is told once, until someone marks it "still correct".
alter table pages add column review_months smallint check (review_months in (3, 6, 12));
alter table pages add column review_owner text check (review_owner ~ '^mbr_[a-z2-7]{26}$');
alter table pages add column reviewed_at timestamptz;
alter table pages add column review_told boolean not null default false;
alter table pages add constraint pages_review_complete check (review_months is null or reviewed_at is not null);
create index pages_review on pages (reviewed_at) where review_months is not null and deleted_at is null;
