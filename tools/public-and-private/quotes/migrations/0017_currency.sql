-- Quotes, seventeenth step: SDK 0.7.0 has no Chest currency (a company may
-- work in several). Every document already keeps its own (documents.
-- currency); now the tool keeps:
--
-- - its own default currency, an administrator's setting (Settings):
--   what a new quote, invoice, catalogue item or import starts in. It
--   starts as the currency most of the company's documents are in — what
--   the Chest's currency was when they were made —, else EUR;
-- - each catalogue item's currency beside its price (an item priced in
--   GBP stays in GBP when the default changes);
-- - the currency of the company's share capital, printed in the legal
--   mentions of every document ("SAS au capital de 10 000 €"), whatever
--   the document's own currency.
--
-- New columns with defaults: the previous version keeps working (it reads
-- none of them; what it writes gets the default, EUR, as its Chest's
-- currency was then).
alter table company add column currency text not null default 'EUR' check (currency ~ '^[A-Z]{3}$');
alter table company add column capital_currency text check (capital_currency is null or capital_currency ~ '^[A-Z]{3}$');
update company set currency = coalesce((select currency from documents group by currency order by count(*) desc, currency limit 1), 'EUR');
update company set capital_currency = currency where capital is not null;

alter table items add column currency text not null default 'EUR' check (currency ~ '^[A-Z]{3}$');
update items set currency = (select currency from company where id = 1) where exists (select 1 from company where id = 1);
