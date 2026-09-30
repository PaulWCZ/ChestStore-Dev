-- Polls, fifth step: who the Chest's calendar did not take.
--
-- The chosen date goes to calendars in parts of 1,000 people, in one
-- calendar.putMany that answers each part (SDK studio.16): a part the Chest
-- refuses (its 5,000 events full, a date out of its range) is not in
-- those people's calendars, so the poll's page must not tell them it is.
-- The members of the refused parts, emptied at the next sync that puts
-- them; an erased member is taken out (lib/lifecycle.ts).
alter table polls add column calendar_missing text[] not null default '{}';
