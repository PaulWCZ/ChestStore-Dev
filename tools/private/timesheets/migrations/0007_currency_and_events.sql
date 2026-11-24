-- Timesheets on SDK 0.7.0 (contract 0.7). Expand only: nothing is dropped,
-- renamed or retyped.
--
-- The Chest has no currency any more: the currency of rates, budgets and
-- amounts is the tool's own setting (src/lib/money.ts), and every amount
-- keeps its code beside it. Rates entered before were in the Chest's
-- currency, EUR unless its owner chose another (a manager corrects it in
-- Settings while no time was invoiced or handed to Quotes).
alter table settings add column currency text not null default 'EUR' check (currency ~ '^[A-Z]{3}$');
alter table rates add column currency text not null default 'EUR' check (currency ~ '^[A-Z]{3}$');
alter table projects add column currency text not null default 'EUR' check (currency ~ '^[A-Z]{3}$');
-- The currency of bill_rate_cents and cost_rate_cents once written on an
-- entry (rates_fixed).
alter table entries add column rates_currency text check (rates_currency is null or rates_currency ~ '^[A-Z]{3}$');
update entries set rates_currency = 'EUR' where rates_fixed;
-- The members Quotes allowed to see an invoice (the audience of its
-- "quotes.invoiced"): null for every member.
alter table handoffs add column invoice_audience text[];
