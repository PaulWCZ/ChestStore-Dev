-- Equipment on SDK 0.7.0 (contract 0.7).
--
-- The Chest has no currency any more (a company may work in several): every
-- amount keeps its own ISO 4217 code beside it, and the tool keeps its own
-- default currency, which fills the currency of a new amount — nothing else.
-- The amounts written before this release were in the Chest's currency,
-- which was EUR unless its owner had set another: they are marked EUR here
-- (a manager corrects an item's currency on its form).

create table settings (
  id boolean primary key default true check (id),
  currency text not null default 'EUR' check (currency ~ '^[A-Z]{3}$')
);
insert into settings default values;

-- An item's price and its cost (a licence's) are in the item's currency.
alter table items add column currency text check (currency is null or currency ~ '^[A-Z]{3}$');
update items set currency = 'EUR' where price_cents is not null or cost_cents is not null;
alter table items add constraint items_money_has_currency check ((price_cents is null and cost_cents is null) or currency is not null);

-- A repair's cost, in its own currency.
alter table history add column currency text check (currency is null or currency ~ '^[A-Z]{3}$');
update history set currency = 'EUR' where cost_cents is not null;
alter table history add constraint history_cost_has_currency check (cost_cents is null or currency is not null);

-- The history stays append-only: its currency too.
create or replace function history_append_only() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'history is append-only';
  end if;
  if new.id <> old.id or new.item_id <> old.item_id or new.at <> old.at or new.kind <> old.kind
     or new.day is distinct from old.day or new.place is distinct from old.place or new.status is distinct from old.status or new.note is distinct from old.note
     or new.qty is distinct from old.qty or new.cost_cents is distinct from old.cost_cents or new.currency is distinct from old.currency
     or new.ref is distinct from old.ref or new.due is distinct from old.due
     or (new.actor <> old.actor and new.actor <> 'erased')
     or (new.member is distinct from old.member and new.member <> 'erased') then
    raise exception 'history is append-only';
  end if;
  return new;
end $$;

-- Who in People may see a departure (SDK 0.7.0: an event's audience): null
-- for every member, else the members of Equipment People allows. Managers
-- outside it are not told and do not see it.
alter table departures add column audience text[]
  check (audience is null or cardinality(audience) <= 5000);
