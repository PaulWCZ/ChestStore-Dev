-- The home address and the emergency contact are sealed by the Chest (SDK
-- 0.5+, capability "sealed"; src/lib/sealing.ts): the columns hold
-- `chest:sealed:1:…` text, longer than the values (their own bounds are
-- checked by the tool before sealing). own_sealed is the person's copy of
-- the four (one sealed JSON value), so they read their own record.
-- Values written before are sealed by the morning run. Nothing is dropped
-- but four length checks, replaced by wider ones.
alter table records drop constraint if exists records_address_check;
alter table records drop constraint if exists records_emergency_name_check;
alter table records drop constraint if exists records_emergency_relation_check;
alter table records drop constraint if exists records_emergency_phone_check;
alter table records add constraint records_address_sealed_check check (char_length(address) <= 4096);
alter table records add constraint records_emergency_name_sealed_check check (char_length(emergency_name) <= 4096);
alter table records add constraint records_emergency_relation_sealed_check check (char_length(emergency_relation) <= 4096);
alter table records add constraint records_emergency_phone_sealed_check check (char_length(emergency_phone) <= 4096);
alter table records add column own_sealed text check (own_sealed is null or char_length(own_sealed) <= 16384);
