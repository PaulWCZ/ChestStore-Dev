-- Equipment on SDK 0.7.0, after review. Expand only: nothing is dropped,
-- renamed or retyped.
--
-- 0009 marked every amount written before 0.7.0 EUR: the Chest's currency
-- (0.4's chest.currency, gone in 0.7.0) was never written in Equipment's
-- data — no hand-off, no event, no file kept it — so there is nothing
-- better to read it from. A company that worked in another currency would
-- otherwise have to correct its items one by one. So the amounts 0009
-- labelled are marked guessed (0009 and 0010 run in the same release: at
-- this point, every amount with a currency is one 0009 labelled), and the
-- first time a manager saves the default currency, every guessed amount
-- takes it, read again in its minor unit (0.4 kept every amount in
-- hundredths: 1299.90 is 129990, ¥1,300 in yen, 1299.900 in dinars) —
-- lib/settings.ts. An item a manager saves with a new price, cost or
-- currency is no longer guessed.
alter table settings add column currency_guessed boolean not null default false;
alter table items add column currency_guessed boolean not null default false;
alter table history add column currency_guessed boolean not null default false;
update items set currency_guessed = true where currency is not null;
update history set currency_guessed = true where currency is not null;
update settings set currency_guessed = exists (select 1 from items where currency_guessed) or exists (select 1 from history where currency_guessed);

-- The history stays append-only, but for a guessed currency taking the
-- manager's (once: a guessed row becomes a known one, never the reverse).
create or replace function history_append_only() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'history is append-only';
  end if;
  if new.currency_guessed and not old.currency_guessed then
    raise exception 'history is append-only';
  end if;
  if new.id <> old.id or new.item_id <> old.item_id or new.at <> old.at or new.kind <> old.kind
     or new.day is distinct from old.day or new.place is distinct from old.place or new.status is distinct from old.status or new.note is distinct from old.note
     or new.qty is distinct from old.qty
     or ((new.cost_cents is distinct from old.cost_cents or new.currency is distinct from old.currency) and not (old.currency_guessed and not new.currency_guessed))
     or new.ref is distinct from old.ref or new.due is distinct from old.due
     or (new.actor <> old.actor and new.actor <> 'erased')
     or (new.member is distinct from old.member and new.member <> 'erased') then
    raise exception 'history is append-only';
  end if;
  return new;
end $$;
