-- Field names and the example rules the tool offers speak each reader's
-- language until a manager changes them (store rule: defaults are keys).
-- A field with a key shows the catalogue's name for it ("RAM (GB)" /
-- « Mémoire vive (Go) »); renamed, the key goes and the name is the
-- manager's. `name` keeps the English words, for uniqueness and imports.
alter table fields add column key text check (key in ('imei', 'ram', 'os', 'plate', 'inspection'));
update fields set key = case lower(name)
  when 'imei' then 'imei' when 'ram (gb)' then 'ram' when 'operating system' then 'os'
  when 'licence plate' then 'plate' when 'next inspection' then 'inspection' end
  where key is null and lower(name) in ('imei', 'ram (gb)', 'operating system', 'licence plate', 'next inspection');

-- The example rules: the catalogue's text in each reader's language (the
-- one a receipt shows is the version the person accepted: the example's
-- words, in whichever language it is read). `body` keeps the English.
alter table charters add column example boolean not null default false;

-- "Remind them": when a manager last reminded the holder of a receipt still
-- waiting (once a day at most).
alter table receipts add column reminded_at timestamptz;
