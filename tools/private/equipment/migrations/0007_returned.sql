-- Equipment tells People (Proposal (studio): events between tools, once an
-- admin linked the two) that everything a leaving person held is back:
-- equipment.returned {member}, key equipment:<member>:returned:<time>.
-- People ticks the leaving checklist's "Return the laptop, badge and keys"
-- step (People's README, "With the other tools").
--
-- Leaving: People told of a last day (people.leaving, a departure with a
-- day). Everything back: no item and no licence seat held any more — a
-- take-back, "Take everything back", a seat taken, an item given to
-- someone else, marked lost or retired, or deleted. A trigger, run when the
-- transaction commits (so a change undone in the same transaction tells
-- nothing), writes it in the same transaction as the change, whatever made
-- it; lib/returned.ts publishes it after the action, and the "returns"
-- schedule again while the Chest cannot take it. Someone who held nothing
-- when People told of their departure is never told of: nothing came back.
--
-- A departure is now kept when the person leaves the Chest (left_at):
-- their laptop often comes back after their access went, and People still
-- waits for it. The managers' lists leave such departures out ("Held by
-- people who left" says the rest, as before).

alter table departures add column left_at timestamptz;

create table returned_events (
  id bigint generated always as identity primary key,
  member_id text not null check (member_id ~ '^mbr_[a-z2-7]{26}$'),
  at timestamptz not null default clock_timestamp(),
  published_at timestamptz
);
create index returned_events_pending on returned_events (id) where published_at is null;
create index returned_events_member on returned_events (member_id);

create function everything_back() returns trigger language plpgsql as $$
declare
  who text;
begin
  if tg_table_name = 'items' then
    who := old.holder;
  else
    who := old.member_id;
  end if;
  if who is null or who !~ '^mbr_[a-z2-7]{26}$' then
    return null;
  end if;
  if not exists (select 1 from departures where member_id = who and last_day is not null) then
    return null;
  end if;
  if exists (select 1 from items where holder = who and deleted_at is null)
    or exists (select 1 from seats s join items i on i.id = s.item_id where s.member_id = who and i.deleted_at is null) then
    return null;
  end if;
  -- Several rows of one change (everything taken back at once): one word.
  if exists (select 1 from returned_events where member_id = who and published_at is null) then
    return null;
  end if;
  insert into returned_events (member_id) values (who);
  return null;
end
$$;

create constraint trigger items_everything_back after update of holder, deleted_at on items
  deferrable initially deferred for each row execute function everything_back();
create constraint trigger seats_everything_back after update of member_id or delete on seats
  deferrable initially deferred for each row execute function everything_back();
