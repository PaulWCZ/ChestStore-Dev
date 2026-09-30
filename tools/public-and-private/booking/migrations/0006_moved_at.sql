-- When a booking was last moved, so what Booking tells Clients of a move
-- (booking.confirmed) is the same every time it is told: a retry of the
-- same (booking, moves) carries the same data, and the Chest takes it as
-- the same event. Earlier versions keep working: a new column, empty for
-- bookings never moved (and for those moved before this version, whose
-- moves were already told).
alter table bookings add column moved_at timestamptz;
