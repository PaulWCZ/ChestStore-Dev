-- Timesheets, sixth step: what its pages show changes when one of these
-- tables does — the change log of @argentic/chest-app (its sql/changes.sql,
-- below as it is), read by changeStamp() for a page's version (src/lib/stamp.ts):
-- a page read again while nothing changed is answered 304, nothing rendered.

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
select chest_watch('clients');
select chest_watch('projects');
select chest_watch('tasks');
select chest_watch('project_people');
select chest_watch('entries');
select chest_watch('week_rows');
select chest_watch('timers');
select chest_watch('rates');
select chest_watch('former_people');
select chest_watch('weeks');
select chest_watch('people');
select chest_watch('handoffs');
