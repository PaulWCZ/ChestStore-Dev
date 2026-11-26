-- An invoice or credit note in another currency than the euro states its
-- VAT in euros too (Directive 2006/112/EC art. 230; the Factur-X's BT-6 and
-- BT-111, BR-FR-CO-12): the exchange rate the member gives, as the ECB
-- publishes it — units of the document's currency for one euro — in
-- millionths (1 € = 1.0823 USD is 1082300). Frozen with the document.
alter table documents add column eur_rate bigint check (eur_rate is null or eur_rate > 0);
