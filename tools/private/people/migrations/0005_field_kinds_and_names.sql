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

-- An example template's name, like its steps, speaks each reader's
-- language until HR renames it: its phrase is its kind's example name
-- ("Office newcomer" / « Nouvel arrivant au bureau »). A checklist started
-- from it keeps the phrase.
alter table templates add column phrase text check (phrase in ('onboarding', 'offboarding'));
alter table journeys add column phrase text check (phrase in ('onboarding', 'offboarding'));
update templates set phrase = kind
  where (kind = 'onboarding' and name in ('Office newcomer', 'Nouvel arrivant au bureau')) or (kind = 'offboarding' and name in ('Leaving', 'Départ'));
update journeys j set phrase = t.phrase from templates t where t.id = j.template_id and t.phrase is not null and j.name = t.name;
