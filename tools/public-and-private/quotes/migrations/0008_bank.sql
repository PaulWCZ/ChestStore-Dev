-- A payment recorded from a line of a bank statement remembers that line
-- (its fingerprint: day, amount, words, place among identical lines), so
-- the same statement read again does not offer it twice. A payment deleted
-- frees its line.
alter table payments add column bank_line text;
create unique index payments_by_bank_line on payments (bank_line) where bank_line is not null and deleted_at is null;
