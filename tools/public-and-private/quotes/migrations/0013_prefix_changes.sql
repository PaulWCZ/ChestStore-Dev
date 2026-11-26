-- A prefix changed is a numbering change too (Settings' history): kept
-- with the kind it is for. A change is now one of three: a sequence
-- continued (type, period, next), a format chosen (number_format), or a
-- kind's prefix (type, prefix).
alter table numbering_changes add column prefix text;
alter table numbering_changes drop constraint one_change;
alter table numbering_changes add constraint one_change check (
  (type is not null and period is not null and next is not null and number_format is null and prefix is null)
  or (type is null and period is null and next is null and number_format is not null and prefix is null)
  or (type is not null and prefix is not null and period is null and next is null and number_format is null));
