-- Sample data for local runs and screenshots (never run by the Chest): the
-- design agency "Atelier Martin" — three clients, five projects (one with
-- its budget almost spent), their tasks, three weeks of everyone's time
-- (dates relative to today) plus older time on the website, last month
-- locked, and one running timer. The member ids are those of the studio's
-- dev harness (lab/chest-dev/cast.mjs).

insert into clients (name) values ('Boulangerie Dupain'), ('Garage Leroy'), ('Mairie de Villeurbanne');

insert into projects (client_id, name, color, billable, rate_cents, budget_kind, budget_minutes, budget_cents, everyone) values
  ((select id from clients where name = 'Boulangerie Dupain'), 'Site vitrine', 'teal', true, 8500, 'hours', 3600, null, true),
  ((select id from clients where name = 'Garage Leroy'), 'Identité visuelle', 'coral', true, 9500, 'money', null, 900000, true),
  ((select id from clients where name = 'Mairie de Villeurbanne'), 'Signalétique', 'indigo', true, 7500, 'hours', 12000, null, true),
  ((select id from clients where name = 'Mairie de Villeurbanne'), 'Newsletter', 'sky', true, 7000, 'none', null, null, false),
  (null, 'Atelier (interne)', 'olive', false, null, 'none', null, null, true);

insert into tasks (project_id, name)
select p.id, t.name from projects p
join (values
  ('Site vitrine', 'Design'), ('Site vitrine', 'Développement'), ('Site vitrine', 'Réunions'),
  ('Identité visuelle', 'Logo'), ('Identité visuelle', 'Charte graphique'), ('Identité visuelle', 'Réunions'),
  ('Signalétique', 'Repérage'), ('Signalétique', 'Design'), ('Signalétique', 'Pose'),
  ('Newsletter', 'Rédaction'), ('Newsletter', 'Mise en page'),
  ('Atelier (interne)', 'Réunion d''équipe'), ('Atelier (interne)', 'Formation'), ('Atelier (interne)', 'Administratif')
) as t(project, name) on t.project = p.name;

-- The newsletter is only for Léa and Tom.
insert into project_people (project_id, member_id)
select id, m from projects, unnest(array['mbr_leaaaaaaaaaaaaaaaaaaaaaaaa', 'mbr_tomaaaaaaaaaaaaaaaaaaaaaaa']) as m where name = 'Newsletter';

-- Who works on what, on which weekdays (1 Monday … 5 Friday), how long,
-- with notes to pick from.
create temporary table plan (member text, project text, task text, days int[], minutes int, notes text[]);
insert into plan values
  ('mbr_camilleaaaaaaaaaaaaaaaaaaa', 'Site vitrine', 'Réunions', '{1,3}', 60, '{"Point hebdo avec M. Dupain","Relecture des maquettes avec le client"}'),
  ('mbr_camilleaaaaaaaaaaaaaaaaaaa', 'Identité visuelle', 'Charte graphique', '{1,2,4}', 180, '{"Déclinaisons de la charte","Choix des typographies","Papeterie et cartes de visite"}'),
  ('mbr_camilleaaaaaaaaaaaaaaaaaaa', 'Signalétique', 'Design', '{2,3,5}', 150, '{"Pictogrammes du parc","Panneaux d''entrée","Plan d''ensemble"}'),
  ('mbr_camilleaaaaaaaaaaaaaaaaaaa', 'Atelier (interne)', 'Administratif', '{1,2,3,4,5}', 75, '{"Devis et factures","Planning de la semaine","Relances"}'),
  ('mbr_inesaaaaaaaaaaaaaaaaaaaaaa', 'Identité visuelle', 'Logo', '{1,2,3}', 240, '{"Pistes de logo","Logo v2 après retours","Version monochrome"}'),
  ('mbr_inesaaaaaaaaaaaaaaaaaaaaaa', 'Site vitrine', 'Design', '{3,4,5}', 210, '{"Maquette de la page d''accueil","Page produits","Version mobile"}'),
  ('mbr_inesaaaaaaaaaaaaaaaaaaaaaa', 'Atelier (interne)', 'Réunion d''équipe', '{1}', 45, '{"Réunion du lundi"}'),
  ('mbr_hugoaaaaaaaaaaaaaaaaaaaaaa', 'Site vitrine', 'Développement', '{1,2,3,4,5}', 300, '{"Intégration de l''accueil","Formulaire de commande","Optimisation des images","Corrections après recette"}'),
  ('mbr_hugoaaaaaaaaaaaaaaaaaaaaaa', 'Signalétique', 'Repérage', '{2,4}', 120, '{"Repérage au parc de la Feyssine","Photos des emplacements"}'),
  ('mbr_hugoaaaaaaaaaaaaaaaaaaaaaa', 'Atelier (interne)', 'Réunion d''équipe', '{1}', 45, '{"Réunion du lundi"}'),
  ('mbr_leaaaaaaaaaaaaaaaaaaaaaaaa', 'Signalétique', 'Design', '{1,2,3,4}', 240, '{"Panneaux directionnels","Charte signalétique","Fichiers pour l''imprimeur"}'),
  ('mbr_leaaaaaaaaaaaaaaaaaaaaaaaa', 'Newsletter', 'Mise en page', '{2,4}', 120, '{"Gabarit d''octobre","Mise en page du numéro 12"}'),
  ('mbr_leaaaaaaaaaaaaaaaaaaaaaaaa', 'Atelier (interne)', 'Formation', '{5}', 180, '{"Formation Figma avancé"}'),
  ('mbr_tomaaaaaaaaaaaaaaaaaaaaaaa', 'Newsletter', 'Rédaction', '{1,3,5}', 180, '{"Articles du mois","Agenda culturel","Relecture"}'),
  ('mbr_tomaaaaaaaaaaaaaaaaaaaaaaa', 'Site vitrine', 'Développement', '{2,4}', 240, '{"Paiement en ligne","Tests sur mobile"}'),
  ('mbr_sofiaaaaaaaaaaaaaaaaaaaaaa', 'Atelier (interne)', 'Administratif', '{1,2,3,4,5}', 300, '{"Comptabilité","Factures fournisseurs","Paie","Commandes de fournitures"}'),
  ('mbr_sofiaaaaaaaaaaaaaaaaaaaaaa', 'Identité visuelle', 'Réunions', '{3}', 60, '{"Rendez-vous avec le garage"}');

-- Three weeks: this one (today's morning included), and the two before.
-- Each day's minutes vary a little, in quarters of an hour; a few entries
-- are not billable (a meeting the client does not pay for).
insert into entries (member_id, project_id, task_id, day, minutes, note, billable, started_at, ended_at, source, created_at)
select pl.member, p.id, t.id, d.day,
  greatest(15, (pl.minutes + (((extract(doy from d.day)::int * 7 + length(pl.task) * 3) % 5) - 2) * 15) / (case when d.day = current_date then 2 else 1 end) / 15 * 15),
  pl.notes[1 + (extract(doy from d.day)::int % array_length(pl.notes, 1))],
  p.billable and not (pl.task = 'Réunions' and extract(isodow from d.day) = 3),
  null, null, 'grid', d.day + time '18:00'
from plan pl
join projects p on p.name = pl.project
join tasks t on t.project_id = p.id and t.name = pl.task
join (
  select day::date from generate_series(date_trunc('week', current_date) - interval '14 days', current_date, interval '1 day') as day
) d on extract(isodow from d.day)::int = any(pl.days);

-- Older work on the website (weeks 3 to 6 back), so that its budget is
-- nearly spent; and today, what the timer already recorded this morning.
insert into entries (member_id, project_id, task_id, day, minutes, note, billable, source, created_at)
select m, p.id, t.id, day::date, 330, 'Développement du site', true, 'import', day
from projects p join tasks t on t.project_id = p.id and t.name = 'Développement',
  generate_series(date_trunc('week', current_date) - interval '42 days', date_trunc('week', current_date) - interval '17 days', interval '1 day') as day,
  unnest(array['mbr_hugoaaaaaaaaaaaaaaaaaaaaaa']) as m
where p.name = 'Site vitrine' and extract(isodow from day) < 6;

insert into entries (member_id, project_id, task_id, day, minutes, note, billable, started_at, ended_at, source)
select 'mbr_camilleaaaaaaaaaaaaaaaaaaa', p.id, t.id, current_date, 50, 'Planning de la semaine', false,
  now() - interval '2 hours 10 minutes', now() - interval '1 hour 20 minutes', 'timer'
from projects p join tasks t on t.project_id = p.id and t.name = 'Administratif' where p.name = 'Atelier (interne)';

-- The website's budget: the hours used, and a little more.
update projects set budget_minutes = (
  select (ceil(sum(minutes) * 1.06 / 600.0) * 600)::int from entries e where e.project_id = projects.id
) where name = 'Site vitrine';

-- Camille's timer runs since an hour and a quarter.
insert into timers (member_id, project_id, task_id, note, started_at)
select 'mbr_camilleaaaaaaaaaaaaaaaaaaa', p.id, t.id, 'Retours du client sur la page d''accueil', now() - interval '1 hour 14 minutes'
from projects p join tasks t on t.project_id = p.id and t.name = 'Réunions' where p.name = 'Site vitrine';

-- Last month is invoiced: locked by Camille.
update settings set locked_until = date_trunc('month', current_date)::date - 1, locked_by = 'mbr_camilleaaaaaaaaaaaaaaaaaaa', locked_at = date_trunc('month', current_date) + interval '2 days 10 hours';

-- Rates with their history: each project's rate since the start (the
-- signage's went up on the first of this month), Inès billed more on the
-- visual identity, Hugo's usual rate, and what an hour of each person
-- costs the agency.
insert into rates (kind, project_id, from_day, rate_cents, set_by)
select 'bill', id, date '2000-01-01', case when name = 'Signalétique' then 7000 else rate_cents end, 'mbr_camilleaaaaaaaaaaaaaaaaaaa' from projects where rate_cents is not null;
insert into rates (kind, project_id, from_day, rate_cents, set_by)
select 'bill', id, date_trunc('month', current_date)::date, 7500, 'mbr_camilleaaaaaaaaaaaaaaaaaaa' from projects where name = 'Signalétique';
insert into rates (kind, project_id, member_id, from_day, rate_cents, set_by)
select 'bill', id, 'mbr_inesaaaaaaaaaaaaaaaaaaaaaa', date '2000-01-01', 11000, 'mbr_camilleaaaaaaaaaaaaaaaaaaa' from projects where name = 'Identité visuelle';
insert into rates (kind, member_id, from_day, rate_cents, set_by) values
  ('bill', 'mbr_hugoaaaaaaaaaaaaaaaaaaaaaa', date '2000-01-01', 7000, 'mbr_camilleaaaaaaaaaaaaaaaaaaa'),
  ('cost', 'mbr_camilleaaaaaaaaaaaaaaaaaaa', date '2000-01-01', 5500, 'mbr_camilleaaaaaaaaaaaaaaaaaaa'),
  ('cost', 'mbr_inesaaaaaaaaaaaaaaaaaaaaaa', date '2000-01-01', 4800, 'mbr_camilleaaaaaaaaaaaaaaaaaaa'),
  ('cost', 'mbr_hugoaaaaaaaaaaaaaaaaaaaaaa', date '2000-01-01', 4000, 'mbr_camilleaaaaaaaaaaaaaaaaaaa'),
  ('cost', 'mbr_leaaaaaaaaaaaaaaaaaaaaaaaa', date '2000-01-01', 4200, 'mbr_camilleaaaaaaaaaaaaaaaaaaa'),
  ('cost', 'mbr_tomaaaaaaaaaaaaaaaaaaaaaaa', date '2000-01-01', 3800, 'mbr_camilleaaaaaaaaaaaaaaaaaaa'),
  ('cost', 'mbr_sofiaaaaaaaaaaaaaaaaaaaaaa', date '2000-01-01', 3500, 'mbr_camilleaaaaaaaaaaaaaaaaaaa');
update projects set rate_cents = 7500 where name = 'Signalétique';

-- Tom works four days a week.
insert into people (member_id, week_minutes) values ('mbr_tomaaaaaaaaaaaaaaaaaaaaaaa', 1680);

-- Julien Roux left before the Chest; his time came with the Harvest import.
insert into former_people (name) values ('Julien Roux');
insert into entries (member_id, project_id, task_id, day, minutes, note, billable, source, created_at)
select 'imp_' || (select id from former_people where name = 'Julien Roux'), p.id, t.id, day::date, 240, 'Maquettes (Harvest)', true, 'import', day
from projects p join tasks t on t.project_id = p.id and t.name = 'Design',
  generate_series(date_trunc('week', current_date) - interval '42 days', date_trunc('week', current_date) - interval '31 days', interval '1 day') as day
where p.name = 'Site vitrine' and extract(isodow from day) < 6;

-- Last month was invoiced: its billable time keeps its rates for good.
update entries e set invoiced_at = date_trunc('month', current_date) + interval '2 days 10 hours', invoiced_by = 'mbr_camilleaaaaaaaaaaaaaaaaaaa',
  rates_fixed = true, bill_rate_cents = bill_rate(e.member_id, e.project_id, e.day), cost_rate_cents = cost_rate(e.member_id, e.day)
where e.billable and e.day < date_trunc('month', current_date);

-- The weeks sent for approval: two weeks ago all approved but Tom's; last
-- week Inès's approved, Hugo's waiting, Léa's sent back with a word.
insert into weeks (member_id, week, status, minutes, submitted_at, decided_by, decided_at, reason)
select m, date_trunc('week', current_date)::date - 14, 'approved',
  (select coalesce(sum(minutes), 0) from entries where member_id = m and day between date_trunc('week', current_date)::date - 14 and date_trunc('week', current_date)::date - 8),
  date_trunc('week', current_date) - interval '9 days 7 hours', 'mbr_camilleaaaaaaaaaaaaaaaaaaa', date_trunc('week', current_date) - interval '7 days 15 hours', ''
from unnest(array['mbr_camilleaaaaaaaaaaaaaaaaaaa', 'mbr_inesaaaaaaaaaaaaaaaaaaaaaa', 'mbr_hugoaaaaaaaaaaaaaaaaaaaaaa', 'mbr_leaaaaaaaaaaaaaaaaaaaaaaaa', 'mbr_sofiaaaaaaaaaaaaaaaaaaaaaa']) as m;
insert into weeks (member_id, week, status, minutes, submitted_at, decided_by, decided_at, reason)
select m, date_trunc('week', current_date)::date - 7, st,
  (select coalesce(sum(minutes), 0) from entries where member_id = m and day between date_trunc('week', current_date)::date - 7 and date_trunc('week', current_date)::date - 1),
  date_trunc('week', current_date) - interval '2 days 7 hours', by, case when by is null then null else date_trunc('week', current_date) + interval '9 hours' end, why
from (values
  ('mbr_inesaaaaaaaaaaaaaaaaaaaaaa', 'approved', 'mbr_camilleaaaaaaaaaaaaaaaaaaa', ''),
  ('mbr_hugoaaaaaaaaaaaaaaaaaaaaaa', 'submitted', null, ''),
  ('mbr_leaaaaaaaaaaaaaaaaaaaaaaaa', 'returned', 'mbr_camilleaaaaaaaaaaaaaaaaaaa', 'Il manque la formation de vendredi.')
) as w(m, st, by, why);

-- The website crossed 80 % of its budget: its managers heard of it.
insert into budget_alerts (project_id, level) select id, 80 from projects where name = 'Site vitrine';

drop table plan;
