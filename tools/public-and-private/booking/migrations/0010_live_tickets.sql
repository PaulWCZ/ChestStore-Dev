-- Who may join a host's realtime channel ("agenda:<host>", chest.json's
-- "realtime"): the Chest checks this table at every join, on Booking's
-- database, without Booking (SDK 0.7.0's membership tables). A row (the
-- host whose agenda, the member who follows it) is written when Booking
-- shows that agenda to a member it has just checked may see it — a host
-- their own, an administrator any host's (the "Everyone" view, a booking's
-- page) —; it goes whenever that may no longer be true: the member's role
-- changed, they lost access, left or were erased (as a host too). The
-- Chest then takes them out of the channel at once; their page reads
-- itself again and is let in again if still allowed.
-- Without it, any host could join "agenda:<another host>" and learn when
-- that host's meetings are booked, moved or cancelled.
create table agenda_live (
  host_id text not null check (host_id ~ '^mbr_[a-z2-7]{26}$'),
  member_id text not null check (member_id ~ '^mbr_[a-z2-7]{26}$'),
  since timestamptz not null default clock_timestamp(),
  primary key (host_id, member_id)
);
create index agenda_live_member on agenda_live (member_id);
