-- Calendar events and files carry a UID unique to each room booking
-- everywhere: across companies (the team host's domain) and across a
-- database restored from a backup, whose new bookings may take ids that
-- bookings in people's calendars already had. A booking made from now on
-- has a random salt, and its calendar key — the event in the members'
-- feeds, the UID of its .ics files and invitations — is
-- room:<id>:<salt>. Bookings made before keep their key, room:<id>, so a
-- later move or cancellation still updates the event calendars hold.
alter table room_bookings add column uid_salt text;
alter table room_bookings alter column uid_salt set default substr(md5(gen_random_uuid()::text), 1, 12);

-- The key the Chest was given for each event (null: the queue's own key,
-- as before this migration), so a removal names the event the Chest holds
-- even once the booking itself is gone.
alter table calendar_sent add column published text;
