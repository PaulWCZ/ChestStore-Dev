-- Payroll codes, family events counted on worked days, leave after a last
-- day, and balance lines whose reason is written by the tool.

-- The code payroll software imports an absence by (Silae, PayFit and Sage
-- read "CP", "RTT", "MAL", not the name shown on screen). Built-in kinds
-- start with the usual French codes; HR changes them in Settings.
alter table leave_types add column payroll_code text check (payroll_code ~ '^[A-Za-z0-9_.-]{1,12}$');
update leave_types set payroll_code = case key
  when 'paid' then 'CP' when 'rtt' then 'RTT' when 'unpaid' then 'CSS' when 'sick' then 'MAL' when 'family' then 'EVF' end
  where payroll_code is null and key in ('paid', 'rtt', 'unpaid', 'sick', 'family');

-- Family event leave (art. L3142-4) covers the days the person would have
-- worked: it counts their working days, not the paid-leave rule that runs
-- to the day before they are back. Only when HR left the first default.
update leave_types set counting = 'worked' where key = 'family' and counting = 'company';

-- A balance line the tool writes itself carries a reason key, written in
-- the reader's language when shown (the free-text reason stays HR's).
alter table ledger add column reason_key text check (reason_key in ('opening', 'rttYear', 'afterLastDay'));

create or replace function ledger_append_only() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'ledger lines are never deleted';
  end if;
  if new.id <> old.id or new.type_id <> old.type_id or new.kind <> old.kind or new.days <> old.days
     or new.on_date <> old.on_date or new.request_id is distinct from old.request_id or new.created_at <> old.created_at
     or new.bucket is distinct from old.bucket or new.reason_key is distinct from old.reason_key
     or (new.member_id <> old.member_id and new.member_id <> 'erased')
     or (new.created_by <> old.created_by and new.created_by <> 'erased')
     or (new.reason is distinct from old.reason and new.reason is not null) then
    raise exception 'ledger lines are never changed';
  end if;
  return new;
end $$;

-- A last day set: leave that starts after it is cancelled
-- ('after_last_day'), leave that runs past it ends on it ('cut').
alter table request_events drop constraint request_events_kind_check;
alter table request_events add constraint request_events_kind_check
  check (kind in ('asked', 'declared', 'approved', 'refused', 'cancel_asked', 'cancel_declined', 'cancelled', 'reopened', 'restored', 'left', 'recorded', 'imported', 'after_last_day', 'cut'));
