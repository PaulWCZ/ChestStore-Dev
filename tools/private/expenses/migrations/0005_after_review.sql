-- After the review of the move. Bank details someone else entered or
-- changed (an accountant, from "To pay back") wait for their owner's
-- "These are mine" before a transfer file pays into them — the payment
-- diversion an accountant's account could otherwise carry out unseen.
alter table bank_accounts add column confirmed_at timestamptz;

-- An expense its owner took back before anyone decided on it.
alter table history drop constraint history_kind_check;
alter table history add constraint history_kind_check check (kind in ('created', 'edited', 'submitted', 'approved', 'refused', 'paid', 'unpaid', 'reassigned', 'imported', 'retracted'));
