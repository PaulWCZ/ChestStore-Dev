-- Who hears of the expenses sent, live (SDK 0.7.0's realtime, chest.json's
-- "realtime"). Before, the channel "desk" (accountants and approvers) was
-- fed the id of every write of the table expenses — drafts included, and
-- the expenses of people an approver does not approve.
--
-- Now the table expenses is not fed. A trigger writes, for each write of
-- an expense that is or was sent (never a draft's while it stays one), a
-- row of desk_events on each desk that sees it: its approver's
-- ("<approver's id>") and the accountants' ("accountants") — before the
-- write and after it, so a desk the expense leaves (reassigned, taken
-- back, refused) hears of it too. desk_events is fed, its row's id alone,
-- on "desk:<desk_key>". Who may join a desk is the table desk_live (the
-- channel's "join"), which the Chest checks at every join, on the tool's
-- database, without the tool: a row (own id, approver) or (accountants,
-- accountant) once "To approve" checked the member's role; their rows go
-- when their role changes, they lose access, leave or are erased
-- (lib/live.ts), and the Chest takes them out at once.
create table desk_events (
  id bigint generated always as identity primary key,
  expense_id bigint not null,
  desk_key text not null check (desk_key = 'accountants' or desk_key ~ '^mbr_[a-z2-7]{26}$'),
  at timestamptz not null default now()
);
create index desk_events_at on desk_events (at);

create function expenses_desks(e expenses) returns text[] language sql immutable as $$
  select case when e.status = 'draft' then array[]::text[]
    else array['accountants'] || case when e.approver_id ~ '^mbr_[a-z2-7]{26}$' then array[e.approver_id] else array[]::text[] end end
$$;

create function expenses_to_desks() returns trigger language plpgsql as $$
declare
  desks text[] := '{}';
  d text;
begin
  if tg_op <> 'INSERT' then desks := desks || expenses_desks(old); end if;
  if tg_op <> 'DELETE' then desks := desks || expenses_desks(new); end if;
  for d in select distinct unnest(desks) loop
    insert into desk_events (expense_id, desk_key) values (case when tg_op = 'DELETE' then old.id else new.id end, d);
  end loop;
  -- A day of hints is plenty: a page away longer reads itself again.
  delete from desk_events where at < now() - interval '1 day';
  return null;
end
$$;
create trigger expenses_desks after insert or update or delete on expenses for each row execute function expenses_to_desks();

create table desk_live (
  desk_key text not null check (desk_key = 'accountants' or desk_key ~ '^mbr_[a-z2-7]{26}$'),
  member_id text not null check (member_id ~ '^mbr_[a-z2-7]{26}$'),
  since timestamptz not null default clock_timestamp(),
  primary key (desk_key, member_id)
);
create index desk_live_member on desk_live (member_id);

-- How many times a member was taken out of a desk: "To approve"'s version
-- holds it, so the page is read again (never a 304) and lets them in again.
create table live_out (
  member_id text primary key check (member_id ~ '^mbr_[a-z2-7]{26}$'),
  n bigint not null default 1
);
create function expenses_live_out() returns trigger language plpgsql as $$
begin
  insert into live_out (member_id) values (old.member_id) on conflict (member_id) do update set n = live_out.n + 1;
  return null;
end
$$;
create trigger desk_live_out after delete on desk_live for each row execute function expenses_live_out();
