-- The public form's tokens already used for a booking (one booking per
-- form shown; src/lib/guard.ts). Forgotten by the nightly cleanup once
-- older than a token's life.
create table form_tokens (
  hash text primary key,
  at timestamptz not null default now()
);

-- Calendar files carry a UID unique to each booking everywhere
-- (booking-<id>-<12 hex of its link's hash>@booking.chest); bookings made
-- before keep the UID their guests' and hosts' calendars already hold
-- (booking-<id>@chest), so a later move or cancellation still updates them.
alter table bookings add column legacy_uid boolean not null default false;
update bookings set legacy_uid = true;
