-- Round 3: People tells Leave each person's employee number, first day,
-- last day and working week (events between tools); emails beside the
-- bell; paid leave never below zero unless HR allows it.

-- Who set a person's last day: HR by hand ('hr'), the Chest when they left
-- ('chest'), People from their HR record ('record') or from a leaving
-- checklist ('leaving'). People takes back only what People set. When
-- People last told each (events come at least once, not always in order:
-- an older one never undoes a newer one).
alter table staff
  add column end_by text check (end_by in ('hr', 'chest', 'record', 'leaving')),
  add column record_at timestamptz,
  add column leaving_at timestamptz,
  -- Emails beside the bell (the mail proposal): on unless the person turns
  -- them off.
  add column email_off boolean not null default false;
update staff set end_by = 'hr' where end_date is not null;

-- Paid leave may not go below zero unless HR allows it: in France an
-- advance on leave not yet earned needs the employer's consent, and the
-- common tools (Lucca, PayFit) refuse it by default. HR still records leave
-- for someone beyond their balance (an advance it decided), or turns
-- "May go below zero" on for the kind.
update leave_types set overdraw = false where key = 'paid';
