-- Who may join a form's realtime channel ("form:<id>", chest.json's
-- "realtime"): the Chest checks this table at every join, on the tool's
-- database, without the tool (SDK 0.7.0's membership tables). A row is
-- written when the tool shows a form's answers or its card to a member it
-- has just checked may open the form (its owner, someone it is shared
-- with, a manager); it goes whenever that may no longer be true — the
-- form was unshared with them or put in the trash, their role changed,
-- they lost access, left or were erased —, and the Chest then takes them
-- out of the channel at once. Their page reads itself again: still
-- allowed, it is let in again (a new row).
-- Without it every member heard, on one channel "forms", the ids of every
-- form's answers as they came, forms they cannot open included.
create table form_live (
  form_id bigint not null references forms (id) on delete cascade,
  member_id text not null check (member_id ~ '^mbr_[a-z2-7]{26}$'),
  since timestamptz not null default clock_timestamp(),
  primary key (form_id, member_id)
);
create index form_live_member on form_live (member_id);

-- How many times a member was taken out (a row of form_live went): a page's
-- version holds it, so a page whose reader was taken out is read again —
-- never a 304 — and lets them in again with a new mark. (The rows
-- themselves are not in the version: letting a reader in changes nothing
-- they see.) Forgotten with the member at their erasure.
create table live_out (
  member_id text primary key check (member_id ~ '^mbr_[a-z2-7]{26}$'),
  n bigint not null default 1
);
create function forms_live_out() returns trigger language plpgsql as $$
begin
  insert into live_out (member_id) values (old.member_id) on conflict (member_id) do update set n = live_out.n + 1;
  return null;
end
$$;
create trigger form_live_out after delete on form_live for each row execute function forms_live_out();
