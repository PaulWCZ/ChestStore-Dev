-- Rooms, round 2 of the critique: names the tool gives are keys, an
-- example office, and room bookings brought in from a calendar export.

-- A floor or an area the tool named itself (the sample, "Start with an
-- example") keeps the key of its name: each reader sees it in their own
-- language ("Ground floor" / "Rez-de-chaussée") until an admin renames it
-- (the preset goes, the name stays as typed). `name` holds the words of
-- the language it was created in, for places no reader's language
-- reaches (a calendar event's location, a CSV import's matching).
alter table floors add column preset text check (preset is null or preset in ('ground', 'first', 'second', 'third'));
alter table areas add column preset text check (preset is null or preset in ('open_space', 'quiet_zone'));

-- An office made by "Start with an example": said on Places, and deleted
-- whole in one step while nobody booked anything in it.
alter table offices add column example boolean not null default false;

-- A booking brought in from a room calendar's .ics export: `source` is its
-- event (UID and day), so importing the same file again adds nothing;
-- `import_batch` the import it came from, so Undo takes the whole import
-- back.
alter table room_bookings add column source text check (source is null or char_length(source) <= 400);
alter table room_bookings add column import_batch bigint;
create sequence room_imports;
create index room_bookings_source on room_bookings (room_id, source) where source is not null and cancelled_at is null;
create index room_bookings_import on room_bookings (import_batch) where import_batch is not null;
