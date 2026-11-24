-- Who may join a post's realtime channel ("post:<id>", chest.json's
-- "realtime"): the Chest checks this table at every join, on News'
-- database, without News (SDK 0.7.0's membership tables). A row is written
-- when News shows a post to a member it has just checked may read it; it
-- goes when that may no longer be true — the post's audience changed, it
-- was deleted, the member's groups or role changed, they left —, and the
-- Chest then takes them out of the channel at once. Their page reads
-- itself again: still allowed, it is let in again (a new row); no longer,
-- "Nothing here". Without it, any member could join "post:<id>" of a post
-- kept to some groups and learn when it is commented, reacted to or
-- answered.
create table post_live (
  post_id bigint not null references posts (id) on delete cascade,
  member_id text not null check (member_id ~ '^mbr_[a-z2-7]{26}$'),
  since timestamptz not null default clock_timestamp(),
  primary key (post_id, member_id)
);
create index post_live_member on post_live (member_id);
