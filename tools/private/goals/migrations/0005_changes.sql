-- Goals, on the studio stack: a page's version. Every write to Goals'
-- tables moves one counter (a sequence: never a lock, never rolled back),
-- so a page read again with nothing changed answers 304 (src/lib/stamp.ts).
create sequence goals_changes;

create function goals_changed() returns trigger language plpgsql as $$
begin
  perform nextval('goals_changes');
  return null;
end
$$;

create trigger settings_changed after insert or update or delete on settings for each statement execute function goals_changed();
create trigger cycles_changed after insert or update or delete on cycles for each statement execute function goals_changed();
create trigger teams_changed after insert or update or delete on teams for each statement execute function goals_changed();
create trigger objectives_changed after insert or update or delete on objectives for each statement execute function goals_changed();
create trigger key_results_changed after insert or update or delete on key_results for each statement execute function goals_changed();
create trigger check_ins_changed after insert or update or delete on check_ins for each statement execute function goals_changed();
create trigger comments_changed after insert or update or delete on comments for each statement execute function goals_changed();
create trigger departed_changed after insert or update or delete on departed for each statement execute function goals_changed();
create trigger objective_viewers_changed after insert or update or delete on objective_viewers for each statement execute function goals_changed();
create trigger key_result_changes_changed after insert or update or delete on key_result_changes for each statement execute function goals_changed();
create trigger preferences_changed after insert or update or delete on preferences for each statement execute function goals_changed();
create trigger nudges_changed after insert or update or delete on nudges for each statement execute function goals_changed();
create trigger crm_deals_changed after insert or update or delete on crm_deals for each statement execute function goals_changed();
create trigger fed_events_changed after insert or update or delete on fed_events for each statement execute function goals_changed();
