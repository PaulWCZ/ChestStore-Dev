-- Visitors are third parties: their names and companies are kept a shorter
-- time than the bookings (keep_months), 30 days after their visit unless
-- an admin chooses otherwise (Rules, 1 to 90 days).
alter table settings add column visitor_days int not null default 30 check (visitor_days between 1 and 90);

-- A day at the office has a calendar event too: its sequence must grow as
-- the day changes (a desk taken, freed, another office), so the presence
-- row says when it last changed.
alter table presence add column changed_at timestamptz not null default now();
create function presence_changed() returns trigger language plpgsql as $$
begin
  new.changed_at := now();
  return new;
end;
$$;
create trigger presence_changed before update on presence for each row execute function presence_changed();

-- The pages' version (migrations/0009) takes a number only when a row
-- changed: a statement that touches nothing (a purge with nothing to
-- delete, an insert that conflicts) no longer moves it. Row triggers, and
-- truncate's statement trigger.
do $$
declare t text;
begin
  foreach t in array array['settings', 'offices', 'floors', 'areas', 'rooms', 'desks', 'presence', 'member_prefs', 'desk_bookings', 'room_bookings', 'room_attendees', 'usual_week', 'visits']
  loop
    execute format('drop trigger %I on %I', t || '_stamp', t);
    execute format('create trigger %I after insert or update or delete on %I for each row execute function bump_change_stamp()', t || '_stamp', t);
    execute format('create trigger %I after truncate on %I for each statement execute function bump_change_stamp()', t || '_stamp_truncate', t);
  end loop;
end;
$$;
