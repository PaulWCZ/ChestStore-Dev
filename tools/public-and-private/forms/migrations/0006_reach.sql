-- Forms, sixth step.
--
-- forms.kiosk: a form answered on a shared device (a tablet at an
-- event): the runner keeps nothing on the device and starts again after
-- each answer.
-- forms.hidden_fields: the names a form reads from its link (utm_source,
-- ref…) and keeps with each answer (answers.hidden), never on an
-- anonymous form.
-- form_views: how many times a form's page was opened a day, for its
-- completion rate (answers / views) on the summary. Only counts.
alter table forms add column kiosk boolean not null default false;
alter table forms add column hidden_fields text[] not null default '{}' check (cardinality(hidden_fields) <= 10);
alter table answers add column hidden jsonb not null default '{}' check (jsonb_typeof(hidden) = 'object');

alter table forms add constraint anonymous_no_hidden check (not anonymous or cardinality(hidden_fields) = 0);

create table form_views (
  form_id bigint not null references forms on delete cascade,
  day date not null,
  count integer not null default 0,
  primary key (form_id, day)
);
