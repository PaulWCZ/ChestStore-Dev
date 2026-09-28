-- The host's own questions on the booking form, and a daily limit per
-- booking type. Earlier versions keep working: the new columns have
-- defaults (no question, no limit).

-- Up to five questions: [{id, label, kind, required, options}], checked by
-- lib/questions.ts.
alter table types add column questions jsonb not null default '[]'::jsonb
  check (jsonb_typeof(questions) = 'array' and jsonb_array_length(questions) <= 5);
-- At most this many confirmed bookings of the type a day, in the host's
-- time zone (0: no limit).
alter table types add column daily_limit integer not null default 0 check (daily_limit between 0 and 50);

-- The guest's answers, with the questions as they saw them:
-- [{id, label, kind, answer}]. Guest data: deleted with the booking
-- (retention, a guest's erasure).
alter table bookings add column answers jsonb not null default '[]'::jsonb
  check (jsonb_typeof(answers) = 'array' and jsonb_array_length(answers) <= 5);

-- Counting a type's bookings of a day.
create index bookings_type_day on bookings (type_id, starts_at) where status = 'confirmed';
