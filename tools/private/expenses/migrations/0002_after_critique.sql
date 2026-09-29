-- After the severe critique of 2026-09-29: a refusal that means something,
-- guests on meals, tolls and parking, flat rates and hotel nights, foreign
-- currencies with a rate, bank details and the SEPA transfer file, the
-- kilometres driven before the tool, the vehicle's registration, the
-- accounting journal. 0001 shipped: it is never edited.

-- A refused expense remembers what it looked like when it was refused
-- (lib/expenses.ts, fingerprint()): it cannot be sent again, nor approved,
-- until its owner changed something.
alter table expenses add column refused_fingerprint text check (refused_fingerprint is null or refused_fingerprint ~ '^[0-9a-f]{64}$');
