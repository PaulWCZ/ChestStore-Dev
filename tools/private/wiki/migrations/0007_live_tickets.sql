-- Who may join a page's realtime channel ("page:<id>", chest.json's
-- "realtime"): the Chest checks this table at every join, on the wiki's
-- database, without the wiki (SDK 0.7.0's membership tables). A row is
-- written when the wiki shows a page to a member it has just checked may
-- read it; it goes whenever that may no longer be true — the space's
-- audience changed, the page moved or went to the trash, the member's
-- groups or rights changed, they left —, and the Chest then takes them out
-- of the channel at once. Their page reads itself again: still allowed, it
-- is let in again (a new row); no longer, it says "Nothing here".
-- Without it, any member could join "page:<id>" of a page kept to HR or of
-- someone's "My pages" and see who edits it, and when it changes.
create table page_live (
  page_id bigint not null references pages (id) on delete cascade,
  member_id text not null check (member_id ~ '^mbr_[a-z2-7]{26}$'),
  since timestamptz not null default clock_timestamp(),
  primary key (page_id, member_id)
);
create index page_live_member on page_live (member_id);
