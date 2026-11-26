-- Booking, ninth step: SDK 0.7.0's events between tools carry an audience —
-- who in the telling tool may see the item. Booking keeps it with each
-- snapshot of busy times another tool told it (hiring.busy, leave.busy):
-- null when everyone who has Booking may see it, else the list of member
-- ids the Chest gave. The agenda's grey rows show a snapshot only to them;
-- its times are never offered either way. A new nullable column: the
-- previous version keeps working.
alter table told_busy add column audience jsonb check (audience is null or jsonb_typeof(audience) = 'array');
