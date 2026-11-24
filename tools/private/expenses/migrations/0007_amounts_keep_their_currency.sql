-- Expenses, seventh step (SDK 0.7.0): the Chest has no currency. Every
-- amount Expenses keeps carries its own ISO 4217 code: expenses already did
-- (`currency`, and `base_currency` for the amount paid back); the
-- company's limits per category, its flat rates and its mileage scales were
-- "in the company's currency" (the setting `currency`, EUR until the
-- accountant chose another). They now say which, so changing that setting
-- (the currency people are paid back in) never makes 50 euros read as 50
-- pounds: each keeps its code until the accountant enters it again.
-- Expand only: nothing is dropped, renamed or retyped.

alter table categories add column cap_currency text check (cap_currency is null or cap_currency ~ '^[A-Z]{3}$');
update categories set cap_currency = coalesce((select value #>> '{}' from settings where key = 'currency'), 'EUR') where cap_cents is not null;
alter table categories add constraint cap_has_currency check ((cap_cents is null) = (cap_currency is null));

alter table allowances add column currency text check (currency is null or currency ~ '^[A-Z]{3}$');
update allowances set currency = coalesce((select value #>> '{}' from settings where key = 'currency'), 'EUR');
alter table allowances alter column currency set not null;

alter table mileage_scales add column currency text check (currency is null or currency ~ '^[A-Z]{3}$');
update mileage_scales set currency = coalesce((select value #>> '{}' from settings where key = 'currency'), 'EUR');
alter table mileage_scales alter column currency set not null;
