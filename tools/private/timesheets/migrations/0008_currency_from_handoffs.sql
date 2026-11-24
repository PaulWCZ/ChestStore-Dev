-- Timesheets on SDK 0.7.0, after review. Expand only: nothing is dropped,
-- renamed or retyped.
--
-- 0007 took every amount entered before for euros. A Chest whose owner had
-- chosen another currency (0.4's chest.currency, gone in 0.7.0) told each
-- hand-off to Quotes in that one and kept it on the hand-off
-- (handoffs.currency, since 0004) — and once there is a hand-off, the
-- tool's setting can no longer be corrected (src/lib/money.ts). So the
-- currency of the latest hand-off becomes the setting, and the rates,
-- projects and rates written on entries follow it (one currency per
-- Timesheets), as a manager's correction would. With no hand-off nothing
-- changes: the manager corrects it in Settings while it may.
update settings set currency = (select currency from handoffs order by sent_at desc, id desc limit 1)
  where exists (select 1 from handoffs);
update rates set currency = (select currency from settings where id) where currency <> (select currency from settings where id);
update projects set currency = (select currency from settings where id) where currency <> (select currency from settings where id);
update entries set rates_currency = (select currency from settings where id)
  where rates_currency is not null and rates_currency <> (select currency from settings where id);
