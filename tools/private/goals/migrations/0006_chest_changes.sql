-- Goals, sixth step: a page's version from the package's change log
-- (@argentic/chest-app's sql/changes.sql, below as it is) in place of
-- 0005's sequence, whose nextval is seen before its writer commits — a
-- page read in between carried the new number with the old rows (a stale
-- 304 until the next write). A log row is seen only with its commit, and
-- a statement that changes nothing adds none.
drop trigger if exists settings_changed on settings;
drop trigger if exists cycles_changed on cycles;
drop trigger if exists teams_changed on teams;
drop trigger if exists objectives_changed on objectives;
drop trigger if exists key_results_changed on key_results;
drop trigger if exists check_ins_changed on check_ins;
drop trigger if exists comments_changed on comments;
drop trigger if exists departed_changed on departed;
drop trigger if exists objective_viewers_changed on objective_viewers;
drop trigger if exists key_result_changes_changed on key_result_changes;
drop trigger if exists preferences_changed on preferences;
drop trigger if exists nudges_changed on nudges;
drop trigger if exists crm_deals_changed on crm_deals;
drop trigger if exists fed_events_changed on fed_events;
drop function if exists goals_changed();
drop sequence if exists goals_changes;

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
select chest_watch('cycles');
select chest_watch('teams');
select chest_watch('objectives');
select chest_watch('key_results');
select chest_watch('check_ins');
select chest_watch('comments');
select chest_watch('departed');
select chest_watch('objective_viewers');
select chest_watch('key_result_changes');
select chest_watch('preferences');
select chest_watch('nudges');
select chest_watch('crm_deals');
select chest_watch('fed_events');
