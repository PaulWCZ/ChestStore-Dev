-- HR's extra fields gain kinds: a date ("Medical visit", "Badge expires")
-- that can remind HR a number of days before, and a choice from a list
-- ("T-shirt size": S, M, L). A text field stays as it was.
alter table fields
  add column kind text not null default 'text' check (kind in ('text', 'date', 'choice')),
  add column options text[] not null default '{}',
  add column alert_days integer check (alert_days between 1 and 365);
alter table fields add constraint fields_options_check check (
  (kind = 'choice' and cardinality(options) between 1 and 30) or (kind <> 'choice' and cardinality(options) = 0));
alter table fields add constraint fields_alert_check check (alert_days is null or kind = 'date');
