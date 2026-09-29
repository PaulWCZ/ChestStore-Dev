-- After the second critique (2026-09-29): company card statements matched
-- to receipts, postal addresses for transfers to the UK and Switzerland,
-- and the language of the bank texts. 0001 and 0002 shipped: never edited.

-- A card statement the accountant imported (a CSV of the bank or card
-- provider, columns mapped in the browser). Undo takes it back whole while
-- nobody touched what it made.
create table card_statements (
  id bigint generated always as identity primary key,
  created_by text not null,
  created_at timestamptz not null default now(),
  file_name text not null default '' check (char_length(file_name) <= 200)
);

-- One card payment of a statement, for the person who holds the card.
-- `expense_id`: the expense it stands for — one its owner had already added
-- (`link` = 'matched': amount, date and words agree), or a draft made for
-- it and waiting for its receipt ('created'). `line_key` recognises the
-- same payment imported again (an overlapping statement).
create table card_lines (
  id bigint generated always as identity primary key,
  statement_id bigint not null references card_statements (id) on delete cascade,
  member_id text not null check (member_id = 'erased' or member_id ~ '^mbr_[a-z2-7]{26}$'),
  spent_on date not null,
  label text not null default '' check (char_length(label) <= 200),
  amount_cents bigint not null check (amount_cents > 0 and amount_cents <= 100000000),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  line_key text not null check (line_key ~ '^[0-9a-f]{64}$'),
  expense_id bigint references expenses (id) on delete set null,
  link text check (link is null or link in ('matched', 'created')),
  -- The accountant looked at a payment to check (matched to an expense paid
  -- with the holder's own money, or its draft deleted) and cleared it.
  checked_by text,
  checked_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index card_lines_key on card_lines (member_id, line_key);
create unique index card_lines_expense on card_lines (expense_id) where expense_id is not null;
create index card_lines_statement on card_lines (statement_id);

-- A postal address on a bank account. The EPC's rules since the 2023
-- rulebooks ask for it when a transfer goes to a SEPA country outside the
-- EEA (the United Kingdom, Switzerland, Monaco…): lib/sepa.ts writes it,
-- lib/bank.ts asks for it (sources in THIRD_PARTY.md).
alter table bank_accounts add column street text not null default '' check (char_length(street) <= 70);
alter table bank_accounts add column postcode text not null default '' check (char_length(postcode) <= 16);
alter table bank_accounts add column town text not null default '' check (char_length(town) <= 35);
alter table bank_accounts add column address_country text check (address_country is null or address_country ~ '^[A-Z]{2}$');
