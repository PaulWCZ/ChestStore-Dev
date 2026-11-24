-- Goals on SDK 0.7.0 (contract 0.7). Expand only: nothing is dropped,
-- renamed or retyped.
--
-- The Chest has no currency any more: a money key result already kept its
-- own ISO 4217 code (key_results.currency); the default for a new one is
-- now the tool's own setting, EUR until an administrator picks another.
alter table settings add column currency text not null default 'EUR' check (currency ~ '^[A-Z]{3}$');
update key_results set currency = 'EUR' where kind = 'money' and currency is null;

-- Who may see what another tool told (an event's audience, SDK 0.5+): null
-- for every member; else the list the publishing tool allowed. Goals shows
-- a key result's value to everyone who reads its objective, so an item
-- for some members only is kept but never counted.
alter table fed_events add column audience text[];
alter table crm_deals add column audience text[];
