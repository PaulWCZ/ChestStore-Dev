-- What Timesheets counted for a hand-off, in cents excluding VAT (the sum
-- of its lines' `amount`: each entry's minutes at its rate, rounded to the
-- cent, then added). Quotes prices each line as its hours (to the
-- thousandth) × its hourly rate — what a legal invoice line must say —,
-- which may differ by a few cents: the draft's margin shows both when they
-- differ. Null for a hand-off received before, in another currency, or
-- with a line without a rate.
alter table handoffs add column amount bigint;
