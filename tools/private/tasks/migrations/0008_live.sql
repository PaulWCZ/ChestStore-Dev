-- Realtime (SDK 0.5+): the Chest turns the rows of the tables named in
-- chest.json's "feeds" into live events for the pages left open (it adds
-- its own triggers after the migrations: none here for that). A board's
-- page follows its cards; what changes inside a card — a person, a label,
-- a step, a checklist, a comment, a file, a field's value, a blocker —
-- touches the card's changed_at, so the card's row tells the board.
-- Nothing is dropped or renamed (expand only).

alter table cards add column changed_at timestamptz not null default now();

create function tasks_touch_card() returns trigger language plpgsql as $$
begin
  if tg_op <> 'INSERT' then
    update cards set changed_at = now() where id = old.card_id;
  end if;
  if tg_op <> 'DELETE' and (tg_op = 'INSERT' or new.card_id is distinct from old.card_id) then
    update cards set changed_at = now() where id = new.card_id;
  end if;
  return null;
end
$$;

create trigger card_assignees_touch after insert or update or delete on card_assignees for each row execute function tasks_touch_card();
create trigger card_labels_touch after insert or update or delete on card_labels for each row execute function tasks_touch_card();
create trigger checklists_touch after insert or update or delete on checklists for each row execute function tasks_touch_card();
create trigger checklist_items_touch after insert or update or delete on checklist_items for each row execute function tasks_touch_card();
create trigger comments_touch after insert or update or delete on comments for each row execute function tasks_touch_card();
create trigger attachments_touch after insert or update or delete on attachments for each row execute function tasks_touch_card();
create trigger card_values_touch after insert or update or delete on card_values for each row execute function tasks_touch_card();
create trigger card_blockers_touch after insert or update or delete on card_blockers for each row execute function tasks_touch_card();
