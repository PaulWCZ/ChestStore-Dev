-- Microsoft Intune, read only (critique round 3: "no MDM sync"). What the
-- last read of Intune said about each device with a serial number, keyed by
-- that number (folded): matched to an item by its serial number when read.
-- Only device facts are kept; the person Intune names is kept as the Chest
-- member it matched (by name), never as a name or an address.
create table intune_devices (
  serial_key text primary key check (char_length(serial_key) between 1 and 80),
  serial text not null check (char_length(serial) between 1 and 80),
  device_name text check (device_name is null or char_length(device_name) <= 120),
  manufacturer text check (manufacturer is null or char_length(manufacturer) <= 120),
  model text check (model is null or char_length(model) <= 120),
  os text check (os is null or char_length(os) <= 120),
  os_version text check (os_version is null or char_length(os_version) <= 120),
  last_check_in timestamptz,
  member_id text check (member_id is null or member_id ~ '^mbr_[a-z2-7]{26}$' or member_id = 'erased'),
  read_at timestamptz not null
);

-- Each read: when, who asked (a member, or 'schedule'), how it went; the
-- devices counted (those without a serial number cannot be matched).
create table intune_reads (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  by text not null,
  outcome text not null check (outcome in ('ok', 'not_connected', 'denied', 'unreachable', 'busy', 'invalid')),
  devices integer,
  without_serial integer
);
create index intune_reads_at on intune_reads (at desc);
