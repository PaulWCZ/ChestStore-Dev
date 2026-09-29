-- Leave years, work schedules, last days, employee numbers, leave recorded
-- for someone, family events and remote work. Everything already recorded
-- keeps its meaning: an opening line without a bucket is what was left to
-- take (acquired), a kind keeps its counting, and a person without a
-- schedule works Monday to Friday.

-- How a kind of leave lives through the year:
--   running   one balance that simply continues (the tool's first behaviour);
--   acquired  French paid leave: days earned during one reference period
--             ("being earned", CP N) are taken during the next one
--             ("acquired", CP N-1);
--   yearly    the days of a year are taken the same year (RTT).
-- period_month: the month the year starts (null: the company's, 1 June).
-- unused: what happens to days not taken when their year is over — carried
-- over (they stay), or lost. The tool never pays them: in France unused
-- paid leave is paid only when the contract ends (art. L3141-28).
-- overdraw: whether a request may ask for more than what is left.
-- away: an absence (false: remote work, training — shown as such to
-- everyone, never in the payroll export).
alter table leave_types
  add column period text not null default 'running' check (period in ('running', 'acquired', 'yearly')),
  add column period_month int check (period_month between 1 and 12),
  add column unused text not null default 'carry' check (unused in ('carry', 'lose')),
  add column overdraw boolean not null default true,
  add column away boolean not null default true;

alter table leave_types drop constraint leave_types_key_check;
alter table leave_types add constraint leave_types_key_check check (key in ('paid', 'rtt', 'unpaid', 'sick', 'other', 'family', 'remote'));
-- worked: the days the person works (their schedule), public holidays
-- excluded — RTT and remote days, never counted on a day not worked.
alter table leave_types drop constraint leave_types_counting_check;
alter table leave_types add constraint leave_types_counting_check check (counting in ('company', 'calendar', 'worked'));

update leave_types set period = 'acquired' where key = 'paid';
update leave_types set period = 'yearly', period_month = 1, counting = case when counting = 'company' then 'worked' else counting end where key = 'rtt';

-- Family events (Code du travail, art. L3142-4) and remote work, as two
-- more kinds; HR hides them if the company does not want them.
insert into leave_types (key, color, balance, per_year, half_days, counting, approval, notes, position)
  select 'family', 'rose', false, 0, false, 'company', true, true, coalesce(max(position), 0) + 1 from leave_types
  where not exists (select 1 from leave_types where key = 'family');
insert into leave_types (key, color, balance, per_year, half_days, counting, approval, notes, position, away)
  select 'remote', 'sea', false, 0, true, 'worked', false, true, coalesce(max(position), 0) + 1, false from leave_types
  where not exists (select 1 from leave_types where key = 'remote');

-- Each person: their last day (set when they leave the Chest, or by HR):
-- nothing is earned after it; the days of the week they work (0 Sunday …
-- 6 Saturday; null: Monday to Friday); their employee number for payroll.
alter table staff
  add column end_date date,
  add column work_days smallint[] check (work_days is null or (cardinality(work_days) between 1 and 7 and work_days <@ array[0, 1, 2, 3, 4, 5, 6]::smallint[])),
  add column employee_number text check (char_length(employee_number) between 1 and 30);
create unique index staff_employee_number on staff (employee_number) where employee_number is not null;

-- A balance line may say which part of a paid-leave balance it is:
-- 'acquired' (earned last year, to take now) or 'earning' (being earned
-- this year). None: acquired.
alter table ledger add column bucket text check (bucket in ('acquired', 'earning'));

create or replace function ledger_append_only() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'ledger lines are never deleted';
  end if;
  if new.id <> old.id or new.type_id <> old.type_id or new.kind <> old.kind or new.days <> old.days
     or new.on_date <> old.on_date or new.request_id is distinct from old.request_id or new.created_at <> old.created_at
     or new.bucket is distinct from old.bucket
     or (new.member_id <> old.member_id and new.member_id <> 'erased')
     or (new.created_by <> old.created_by and new.created_by <> 'erased')
     or (new.reason is distinct from old.reason and new.reason is not null) then
    raise exception 'ledger lines are never changed';
  end if;
  return new;
end $$;

-- The family event a request is for (its legal days are in lib/rules.ts).
alter table requests add column event text check (event in ('wedding', 'childWedding', 'birth', 'childDeath', 'partnerDeath', 'familyDeath', 'childIllness'));

-- recorded: HR or an approver entered the leave for the person (a phone
-- call, someone without a computer); imported: brought from another tool.
alter table request_events drop constraint request_events_kind_check;
alter table request_events add constraint request_events_kind_check
  check (kind in ('asked', 'declared', 'approved', 'refused', 'cancel_asked', 'cancel_declined', 'cancelled', 'reopened', 'restored', 'left', 'recorded', 'imported'));
