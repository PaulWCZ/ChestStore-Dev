-- What the pages show changes when one of these tables does: every write
-- takes the next number of change_stamp (a sequence: no lock, no row two
-- writers wait for). A page's version is that number with the day and the
-- quarter hour (src/lib/stamp.ts): a page read again while nothing changed
-- is answered 304, nothing rendered.
create sequence change_stamp;

create function bump_change_stamp() returns trigger language plpgsql as $$
begin
  perform nextval('change_stamp');
  return null;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['settings', 'offices', 'floors', 'areas', 'rooms', 'desks', 'presence', 'member_prefs', 'desk_bookings', 'room_bookings', 'room_attendees', 'usual_week', 'visits']
  loop
    execute format('create trigger %I after insert or update or delete or truncate on %I for each statement execute function bump_change_stamp()', t || '_stamp', t);
  end loop;
end;
$$;
