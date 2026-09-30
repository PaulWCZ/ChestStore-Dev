-- Clients receives what Booking tells (Proposal (studio): events between
-- tools): `booking.confirmed` and `booking.cancelled`, a meeting a guest
-- booked with a member (lib/from-booking.ts). The guest becomes a contact
-- (found by their email, as forms' respondents are) and the meeting a line
-- of their history, of a new kind, 'booking'.
-- The previous version keeps working on this schema: nothing it reads was
-- removed, only a kind and a table added.

alter table activities drop constraint activities_kind_check;
alter table activities add constraint activities_kind_check check (kind in ('call', 'meeting', 'email', 'note', 'step', 'created', 'stage', 'won', 'lost', 'reopened', 'owner', 'unassigned', 'merged', 'form', 'booking'));

-- One row per booking of Booking, whatever happened to its line: where it
-- stands (confirmed, or cancelled — final), how often it was moved (a
-- later `confirmed` has more moves; an older or repeated one changes
-- nothing), when and with whom, and its line of history. The line gone
-- (its contact deleted or erased) leaves the row: a later event never
-- brings the person back.
create table booked_meetings (
  booking text primary key check (booking ~ '^[A-Za-z0-9_-]{1,64}$'),
  status text not null check (status in ('confirmed', 'cancelled')),
  moves int not null check (moves >= 0),
  starts_at timestamptz not null,
  ends_at timestamptz not null check (ends_at > starts_at),
  host text check (host is null or host ~ '^mbr_[a-z2-7]{26}$'),
  activity_id bigint references activities (id) on delete set null,
  updated_at timestamptz not null default now()
);
-- My day: the meetings coming up, the host's and the contact owner's.
create index booked_meetings_upcoming on booked_meetings (starts_at) where status = 'confirmed' and activity_id is not null;
create index booked_meetings_host on booked_meetings (host) where host is not null;
create index booked_meetings_activity on booked_meetings (activity_id) where activity_id is not null;
