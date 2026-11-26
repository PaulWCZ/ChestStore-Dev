-- Who hears what changes, live (SDK 0.7.0's realtime, chest.json's
-- "realtime"). Before, one channel "goals" was fed the ids of every write
-- of objectives, key results, check-ins and comments, confidential
-- objectives included: anyone could learn when an objective kept to some
-- people was written, checked in or commented on.
--
-- Now each row is fed on "objective:<live_key>": "everyone" for an
-- objective every member sees (and what belongs to it), the objective's id
-- for a confidential one. Who may join is the table objective_live (the
-- channel's "join"), which the Chest checks at every join, on Goals'
-- database, without Goals: a row (everyone, member) once a page checked
-- the member has a role; a row (an objective's id, member) once a page
-- checked they see that confidential objective (lib/read.ts, visibleTo).
-- The rows of an objective go, here, whenever who sees it may change —
-- its visibility, owner or team, its people, its key results' owners, a
-- team's group, the objective deleted —; a member's rows go in the code
-- when their groups or role change, they lose access, leave or are erased
-- (lib/live.ts). The Chest then takes them out of the channel at once;
-- their page reads itself again and is let in again if still allowed.

alter table objectives add column live_key text;
alter table key_results add column live_key text;
alter table check_ins add column live_key text;
alter table comments add column live_key text;

create function goals_objective_key() returns trigger language plpgsql as $$
begin
  new.live_key := case when new.visibility = 'everyone' then 'everyone' else new.id::text end;
  return new;
end
$$;
create trigger objectives_live_key before insert or update of visibility on objectives for each row execute function goals_objective_key();

create function goals_child_key() returns trigger language plpgsql as $$
begin
  if tg_table_name = 'check_ins' then
    select o.live_key into new.live_key from key_results k join objectives o on o.id = k.objective_id where k.id = new.key_result_id;
  else
    select live_key into new.live_key from objectives where id = new.objective_id;
  end if;
  return new;
end
$$;
create trigger key_results_live_key before insert or update of objective_id on key_results for each row execute function goals_child_key();
create trigger comments_live_key before insert or update of objective_id on comments for each row execute function goals_child_key();
create trigger check_ins_live_key before insert or update of key_result_id on check_ins for each row execute function goals_child_key();

update objectives set live_key = case when visibility = 'everyone' then 'everyone' else id::text end;
update key_results k set live_key = o.live_key from objectives o where o.id = k.objective_id;
update comments c set live_key = o.live_key from objectives o where o.id = c.objective_id;
update check_ins c set live_key = k.live_key from key_results k where k.id = c.key_result_id;

-- An objective made confidential or for everyone: what belongs to it
-- follows it to its new channel.
create function goals_key_moved() returns trigger language plpgsql as $$
begin
  update key_results set live_key = new.live_key where objective_id = new.id;
  update comments set live_key = new.live_key where objective_id = new.id;
  update check_ins c set live_key = new.live_key from key_results k where k.id = c.key_result_id and k.objective_id = new.id;
  return null;
end
$$;
create trigger objectives_key_moved after update of visibility on objectives for each row
  when (old.live_key is distinct from new.live_key) execute function goals_key_moved();

create table objective_live (
  objective_key text not null check (objective_key = 'everyone' or objective_key ~ '^[1-9][0-9]{0,18}$'),
  member_id text not null check (member_id ~ '^mbr_[a-z2-7]{26}$'),
  since timestamptz not null default clock_timestamp(),
  primary key (objective_key, member_id)
);
create index objective_live_member on objective_live (member_id);

-- Who sees an objective may have changed: its readers are checked again.
create function goals_forget_objective() returns trigger language plpgsql as $$
begin
  if tg_table_name = 'objectives' then
    delete from objective_live where objective_key = old.id::text;
  elsif tg_table_name = 'key_results' then
    delete from objective_live where objective_key = old.objective_id::text;
    if tg_op = 'UPDATE' then
      delete from objective_live where objective_key = new.objective_id::text;
    end if;
  elsif tg_table_name = 'objective_viewers' then
    delete from objective_live where objective_key = old.objective_id::text and member_id = old.member_id;
  elsif tg_table_name = 'teams' then
    delete from objective_live where objective_key in (select id::text from objectives where team_id = old.id);
  end if;
  return null;
end
$$;
create trigger objectives_forget after update on objectives for each row
  when (old.visibility is distinct from new.visibility or old.owner is distinct from new.owner or old.team_id is distinct from new.team_id)
  execute function goals_forget_objective();
create trigger objectives_forget_deleted after delete on objectives for each row execute function goals_forget_objective();
create trigger key_results_forget after update on key_results for each row
  when (old.owner is distinct from new.owner or old.archived_at is distinct from new.archived_at or old.objective_id is distinct from new.objective_id)
  execute function goals_forget_objective();
create trigger key_results_forget_deleted after delete on key_results for each row execute function goals_forget_objective();
create trigger objective_viewers_forget after delete on objective_viewers for each row execute function goals_forget_objective();
create trigger teams_forget after update of group_id on teams for each row
  when (old.group_id is distinct from new.group_id) execute function goals_forget_objective();

-- How many times a member was taken out (a row of objective_live went): a page's
-- version holds it, so a page whose reader was taken out is read again —
-- never a 304 — and lets them in again with a new mark. (The rows
-- themselves are not in the version: letting a reader in changes nothing
-- they see.) Forgotten with the member at their erasure.
create table live_out (
  member_id text primary key check (member_id ~ '^mbr_[a-z2-7]{26}$'),
  n bigint not null default 1
);
create function goals_live_out() returns trigger language plpgsql as $$
begin
  insert into live_out (member_id) values (old.member_id) on conflict (member_id) do update set n = live_out.n + 1;
  return null;
end
$$;
create trigger objective_live_out after delete on objective_live for each row execute function goals_live_out();
