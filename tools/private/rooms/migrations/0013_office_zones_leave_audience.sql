-- Rooms on SDK 0.7.0 (contract 0.7).
--
-- An office's own time zone. The Chest's zone (chest.timeZone) is the
-- company's reference zone, taken once from the owner's browser and set on
-- no screen; an office in another city keeps its own clock: its rooms'
-- hours, its desks' mornings, its visitors' times are read there. Null:
-- the Chest's zone (every office made before this release). Checked
-- against the zones the server knows when an admin sets it
-- (lib/places.ts); here only its shape.
alter table offices add column time_zone text
  check (time_zone is null or time_zone ~ '^(UTC|[A-Z][A-Za-z_]{1,31}(/[A-Za-z0-9_+-]{1,31}){1,2})$');

-- The zone of the office a floor belongs to, else the one given (the
-- Chest's): what turns a booking's minutes into instants and back.
create function rooms_floor_zone(floor bigint, fallback text) returns text
  language sql stable
  as $$ select coalesce((select o.time_zone from floors f join offices o on o.id = f.office_id where f.id = floor), fallback) $$;

-- Who in Rooms may see a leave Leave told (SDK 0.7.0: an event's
-- audience): null for every member, else the members Leave allows. The
-- "Off" it marks is shown to them only (and to the person on leave); the
-- desk it frees is free for everyone, which tells nothing.
alter table leave_words add column audience text[]
  check (audience is null or cardinality(audience) <= 5000);
