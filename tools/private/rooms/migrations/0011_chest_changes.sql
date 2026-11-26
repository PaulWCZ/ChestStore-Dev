-- Rooms, eleventh step: a page's version from the package's change log
-- (@argentic/chest-app's sql/changes.sql, below as it is) in place of
-- 0009's sequence, whose nextval is seen before its writer commits (a page
-- read in between carried the new number with the old rows: a stale 304
-- until the next write). A log row is seen only with its commit; one per
-- transaction (not per row: an import of 5,000 rows adds one); a
-- statement that changes nothing adds none.
do $$
declare t text;
begin
  foreach t in array array['settings', 'offices', 'floors', 'areas', 'rooms', 'desks', 'presence', 'member_prefs', 'desk_bookings', 'room_bookings', 'room_attendees', 'usual_week', 'visits']
  loop
    execute format('drop trigger if exists %I on %I', t || '_stamp', t);
    execute format('drop trigger if exists %I on %I', t || '_stamp_truncate', t);
  end loop;
end;
$$;
drop function if exists bump_change_stamp();
drop sequence if exists change_stamp;

-- What changed, for a page's version (@argentic/chest-app/db changeStamp()):
-- each transaction that changes rows of a watched table adds ONE row here.
-- An insert-only log: no row two writers wait for (never a counter row,
-- which serialises every writer behind an import), and visible only once
-- its transaction commits (never a sequence: nextval is seen before the
-- commit, so a reader could stamp the new number on the old rows).
-- A statement that changes no row adds nothing (transition tables).
create table chest_changes (
  id bigint primary key generated always as identity,
  at timestamptz not null default now()
);
-- The rows forgotten so far (forgetChanges()), folded into one number so
-- the stamp never goes back.
create table chest_changes_base (
  one boolean primary key default true check (one),
  folded bigint not null default 0
);
insert into chest_changes_base default values;

-- Once per transaction: the flag is local to it (and undone with a
-- rolled-back savepoint).
create function chest_changed() returns trigger language plpgsql as $$
begin
  if current_setting('chest.changed', true) is distinct from txid_current()::text and exists (select 1 from changed) then
    insert into chest_changes default values;
    perform set_config('chest.changed', txid_current()::text, true);
  end if;
  return null;
end;
$$;
create function chest_truncated() returns trigger language plpgsql as $$
begin
  if current_setting('chest.changed', true) is distinct from txid_current()::text then
    insert into chest_changes default values;
    perform set_config('chest.changed', txid_current()::text, true);
  end if;
  return null;
end;
$$;

-- chest_watch('notes'): the pages that read notes change when it does.
create function chest_watch(watched regclass) returns void language plpgsql as $$
declare name text := replace(watched::text, '"', '');
begin
  execute format('create trigger %I after insert on %s referencing new table as changed for each statement execute function chest_changed()', name || '_changed_i', watched);
  execute format('create trigger %I after update on %s referencing new table as changed for each statement execute function chest_changed()', name || '_changed_u', watched);
  execute format('create trigger %I after delete on %s referencing old table as changed for each statement execute function chest_changed()', name || '_changed_d', watched);
  execute format('create trigger %I after truncate on %s for each statement execute function chest_truncated()', name || '_changed_t', watched);
end;
$$;

select chest_watch('settings');
select chest_watch('offices');
select chest_watch('floors');
select chest_watch('areas');
select chest_watch('rooms');
select chest_watch('desks');
select chest_watch('presence');
select chest_watch('member_prefs');
select chest_watch('desk_bookings');
select chest_watch('room_bookings');
select chest_watch('room_attendees');
select chest_watch('usual_week');
select chest_watch('visits');
