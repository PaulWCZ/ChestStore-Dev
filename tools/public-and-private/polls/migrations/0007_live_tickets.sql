-- Who may join a poll's realtime channel ("poll:<id>", chest.json's
-- "realtime"): the Chest checks this table at every join, on Polls'
-- database, without Polls (SDK 0.7.0's membership tables). A row is
-- written when Polls shows a poll's page to a member it has just checked
-- may see it; it goes when that may no longer be true — the poll deleted,
-- the member's groups or role changed, they left —, and the Chest then
-- takes them out of the channel at once. Their page reads itself again:
-- still allowed, it is let in again (a new row); no longer, "Nothing here".
-- Without it, any member could join "poll:<id>" of a poll put to other
-- people (a survey of the managers) and learn when it is answered or
-- commented.
create table poll_live (
  poll_id bigint not null references polls (id) on delete cascade,
  member_id text not null check (member_id ~ '^mbr_[a-z2-7]{26}$'),
  since timestamptz not null default clock_timestamp(),
  primary key (poll_id, member_id)
);
create index poll_live_member on poll_live (member_id);
