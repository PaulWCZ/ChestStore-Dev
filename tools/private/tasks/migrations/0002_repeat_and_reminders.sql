-- Recurring cards and the morning reminder.
--
-- A card may repeat (lib/repeat.ts: {"every": "day" | "weekday"},
-- {"every": "week", "days": [0-6]}, {"every": "month", "day": 1-31}). When
-- it is done, the next card of the series is made and named here: a card
-- makes its next one once, however often it is completed or the morning
-- runs.
alter table cards add column repeat jsonb check (repeat is null or (jsonb_typeof(repeat) = 'object' and repeat ? 'every'));
alter table cards add column next_card_id bigint references cards (id) on delete set null;
create index cards_repeat_pending on cards (id) where repeat is not null and next_card_id is null and archived_at is null;

-- The morning reminder, per person: whether they want it, and the day they
-- were last reminded (to take the reminder back once nothing is due). A
-- person without a row gets it.
create table reminders (
  member_id text primary key check (member_id ~ '^mbr_[a-z2-7]{26}$'),
  off boolean not null default false,
  sent_on date
);
