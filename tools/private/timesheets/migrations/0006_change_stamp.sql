-- Timesheets, sixth step: what its pages show changes when one of these
-- tables does. Every row written takes the next number of change_stamp
-- (a sequence: no lock, no row two writers wait for) — per row, not per
-- statement: a statement that changes nothing (a purge with nothing to
-- purge, run as a page is read) must not change the version; a page's version is
-- that number with the day and the quarter hour (src/lib/stamp.ts), so a
-- page read again while nothing changed is answered 304, nothing rendered.
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
  foreach t in array array['settings', 'clients', 'projects', 'tasks', 'project_people', 'entries', 'week_rows', 'timers', 'rates', 'former_people', 'weeks', 'people', 'handoffs']
  loop
    execute format('create trigger %I after insert or update or delete on %I for each row execute function bump_change_stamp()', t || '_stamp', t);
    execute format('create trigger %I after truncate on %I for each statement execute function bump_change_stamp()', t || '_stamp_all', t);
  end loop;
end;
$$;
