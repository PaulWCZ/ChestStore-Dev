-- A read whose devices came but whose users the Chest could not match
-- (members.matchEmails did not answer) is a failed read too: the import
-- page says why, and the last good read stays.
alter table intune_reads drop constraint intune_reads_outcome_check;
alter table intune_reads add constraint intune_reads_outcome_check
  check (outcome in ('ok', 'not_connected', 'denied', 'unreachable', 'busy', 'invalid', 'unavailable'));
