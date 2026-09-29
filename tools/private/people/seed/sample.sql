-- Sample data for local runs and screenshots (never run by the Chest). The
-- member ids are those of the studio's dev harness (lab/chest-dev/cast.mjs).
-- Dates move with today: Nora started six days ago and her welcome
-- checklist is under way; Léa's birthday and Hugo's anniversary fall this
-- month.
insert into profiles (member_id, title, team, office, manager_id, phone, pronouns, bio, skills, start_date, birthday) values
  ('mbr_camilleaaaaaaaaaaaaaaaaaaa', 'Office manager', 'Office', 'Paris', null, '+33 1 84 60 12 01', 'she/her',
   'I keep the office running: contracts, suppliers, the building, and the people who arrive and leave. Come and see me for anything that does not fit elsewhere.',
   array['Contracts', 'Suppliers', 'Payroll questions', 'The building'], date '2017-02-06', '04-18'),
  ('mbr_sofiaaaaaaaaaaaaaaaaaaaaaa', 'HR assistant', 'Office', 'Paris', 'mbr_camilleaaaaaaaaaaaaaaaaaaa', '+33 1 84 60 12 02', '',
   'Onboarding, leave requests and training. I speak Italian and English.',
   array['Onboarding', 'Training', 'Leave'], date '2023-01-09', null),
  ('mbr_inesaaaaaaaaaaaaaaaaaaaaaa', 'Head of sales', 'Sales', 'Lyon', 'mbr_camilleaaaaaaaaaaaaaaaaaaa', '+33 6 12 45 78 90', 'elle',
   'Twelve years selling workshop equipment. I look after our biggest accounts and the sales team.',
   array['Key accounts', 'Pricing', 'Trade shows', 'Negotiation'], date '2019-05-13', null),
  ('mbr_hugoaaaaaaaaaaaaaaaaaaaaaa', 'Account manager', 'Sales', 'Lyon', 'mbr_inesaaaaaaaaaaaaaaaaaaaaaa', '+33 6 98 76 54 32', 'he/him',
   'South-east accounts. Ask me about the demo van — and the coffee machine, which I fixed twice.',
   array['Demo van', 'Quotes', 'CRM'], (current_date - interval '3 years' + interval '5 days')::date, '11-02'),
  ('mbr_noraaaaaaaaaaaaaaaaaaaaaaa', 'Sales assistant', 'Sales', 'Lyon', 'mbr_inesaaaaaaaaaaaaaaaaaaaaaa', '', '',
   '', array[]::text[], current_date - 6, null),
  ('mbr_leaaaaaaaaaaaaaaaaaaaaaaaa', 'Lead developer', 'Tech', 'Paris', 'mbr_camilleaaaaaaaaaaaaaaaaaaa', '+33 6 22 33 44 55', '',
   'I build and run our internal tools and the website. Happy to help with anything that plugs in.',
   array['Website', 'Spreadsheets', 'Printers', 'Accessibility'], date '2020-10-01', to_char(current_date + 9, 'MM-DD')),
  ('mbr_tomaaaaaaaaaaaaaaaaaaaaaaa', 'Developer', 'Tech', 'Remote', 'mbr_leaaaaaaaaaaaaaaaaaaaaaaaa', '+44 7700 900123', 'he/him',
   'Backend and data. Based in Bristol, in Paris one week a month.',
   array['Databases', 'Reports', 'English'], date '2024-03-04', null);

-- The two examples: their names (phrase) and steps speak each reader's language.
insert into templates (kind, name, phrase, created_by, created_at) values
  ('onboarding', 'Office newcomer', 'onboarding', 'mbr_camilleaaaaaaaaaaaaaaaaaaa', now() - interval '60 days'),
  ('offboarding', 'Leaving', 'offboarding', 'mbr_camilleaaaaaaaaaaaaaaaaaaa', now() - interval '60 days');

insert into template_items (template_id, position, text, role, member_id, offset_days) values
  (1, 1, 'Order the laptop and accessories', 'hr', null, -14),
  (1, 2, 'Create their accounts (email, the Chest)', 'hr', null, -3),
  (1, 3, 'Prepare their desk and badge', 'hr', null, -1),
  (1, 4, 'Welcome them and show them around', 'manager', null, 0),
  (1, 5, 'Lunch with the team', 'manager', null, 0),
  (1, 6, 'Show them the demo van', 'member', 'mbr_hugoaaaaaaaaaaaaaaaaaaaaaa', 2),
  (1, 7, 'Fill in your profile in People', 'person', null, 1),
  (1, 8, 'Read the handbook', 'person', null, 2),
  (1, 9, 'Set the first goals together', 'manager', null, 7),
  (1, 10, 'One-month check-in', 'manager', null, 30),
  (2, 1, 'Plan the handover of their work', 'manager', null, -14),
  (2, 2, 'Farewell drink', 'manager', null, -1),
  (2, 3, 'Return the laptop, badge and keys', 'person', null, 0),
  (2, 4, 'Close their accounts and access', 'hr', null, 0),
  (2, 5, 'Send the final documents (certificate, pay slip)', 'hr', null, 0);

insert into journeys (kind, person_id, template_id, name, phrase, anchor, created_by, created_at) values
  ('onboarding', 'mbr_noraaaaaaaaaaaaaaaaaaaaaaa', 1, 'Office newcomer', 'onboarding', current_date - 6, 'mbr_camilleaaaaaaaaaaaaaaaaaaa', now() - interval '21 days');

insert into journey_items (journey_id, position, text, role, assignee, due_on, done_at, done_by) values
  (1, 1, 'Order the laptop and accessories', 'hr', 'mbr_camilleaaaaaaaaaaaaaaaaaaa', current_date - 20, now() - interval '19 days', 'mbr_camilleaaaaaaaaaaaaaaaaaaa'),
  (1, 2, 'Create their accounts (email, the Chest)', 'hr', 'mbr_camilleaaaaaaaaaaaaaaaaaaa', current_date - 9, now() - interval '9 days', 'mbr_camilleaaaaaaaaaaaaaaaaaaa'),
  (1, 3, 'Prepare their desk and badge', 'member', 'mbr_sofiaaaaaaaaaaaaaaaaaaaaaa', current_date - 7, now() - interval '7 days', 'mbr_sofiaaaaaaaaaaaaaaaaaaaaaa'),
  (1, 4, 'Welcome them and show them around', 'manager', 'mbr_inesaaaaaaaaaaaaaaaaaaaaaa', current_date - 6, now() - interval '6 days', 'mbr_inesaaaaaaaaaaaaaaaaaaaaaa'),
  (1, 5, 'Lunch with the team', 'manager', 'mbr_inesaaaaaaaaaaaaaaaaaaaaaa', current_date - 6, now() - interval '6 days', 'mbr_inesaaaaaaaaaaaaaaaaaaaaaa'),
  (1, 6, 'Show them the demo van', 'member', 'mbr_hugoaaaaaaaaaaaaaaaaaaaaaa', current_date - 4, null, null),
  (1, 7, 'Fill in your profile in People', 'person', 'mbr_noraaaaaaaaaaaaaaaaaaaaaaa', current_date - 5, null, null),
  (1, 8, 'Read the handbook', 'person', 'mbr_noraaaaaaaaaaaaaaaaaaaaaaa', current_date - 4, now() - interval '3 days', 'mbr_noraaaaaaaaaaaaaaaaaaaaaaa'),
  (1, 9, 'Set the first goals together', 'manager', 'mbr_inesaaaaaaaaaaaaaaaaaaaaaa', current_date + 1, null, null),
  (1, 10, 'One-month check-in', 'manager', 'mbr_inesaaaaaaaaaaaaaaaaaaaaaa', current_date + 24, null, null),
  (1, 11, 'Plan a coffee with Tom (remote)', 'member', 'mbr_tomaaaaaaaaaaaaaaaaaaaaaaa', current_date + 2, null, null);

-- Told by Hiring (events between tools): Lucie arrives in twelve days.
insert into arrivals (source, ref, name, job, team, place, start_date, hired_by) values
  ('hiring', 'cand_42', 'Lucie Garnier', 'Sales associate', 'Sales', 'Lyon', current_date + 12, 'mbr_inesaaaaaaaaaaaaaaaaaaaaaa');

-- Told by Leave (events between tools): Inès is away until the day after
-- tomorrow, Tom this afternoon. Days in the Chest's time zone.
insert into away (request, member_id, from_day, to_day, from_half, to_half, told_at) values
  ('L-118', 'mbr_inesaaaaaaaaaaaaaaaaaaaaaa', (now() at time zone 'Europe/Paris')::date - 1, (now() at time zone 'Europe/Paris')::date + 2, 'am', 'pm', now()),
  ('L-121', 'mbr_tomaaaaaaaaaaaaaaaaaaaaaaa', (now() at time zone 'Europe/Paris')::date, (now() at time zone 'Europe/Paris')::date, 'pm', 'pm', now());

-- The example steps speak each reader's language (their phrase).
update template_items t set phrase = p.phrase from (values
  ('Order the laptop and accessories', 'onboarding.laptop'), ('Create their accounts (email, the Chest)', 'onboarding.accounts'),
  ('Prepare their desk and badge', 'onboarding.desk'), ('Welcome them and show them around', 'onboarding.welcome'), ('Lunch with the team', 'onboarding.lunch'),
  ('Fill in your profile in People', 'onboarding.profile'), ('Read the handbook', 'onboarding.handbook'), ('Set the first goals together', 'onboarding.goals'),
  ('One-month check-in', 'onboarding.checkIn'), ('Plan the handover of their work', 'offboarding.handover'), ('Farewell drink', 'offboarding.farewell'),
  ('Return the laptop, badge and keys', 'offboarding.equipment'), ('Close their accounts and access', 'offboarding.access'),
  ('Send the final documents (certificate, pay slip)', 'offboarding.documents')
) as p(text, phrase) where t.text = p.text;
update journey_items j set phrase = t.phrase from template_items t where t.template_id = 1 and t.text = j.text;

-- Written by HR by hand: Marc joins the warehouse next month (a weekday).
insert into arrivals (source, ref, name, job, team, place, start_date, hired_by, work_email) values
  ('manual', 'manual-sample1', 'Marc Lefèvre', 'Warehouse lead', 'Logistics', 'Lyon',
   (date_trunc('week', current_date + 35))::date, 'mbr_camilleaaaaaaaaaaaaaaaaaaa', 'marc.lefevre@example.test');

-- An extra field HR added; people fill it in.
insert into fields (label, editor, position) values ('Languages', 'person', 1);
-- A date HR follows, with a reminder a month before (the morning bell).
insert into fields (label, editor, position, kind, alert_days) values ('Medical visit', 'hr', 2, 'date', 30);
insert into field_values (member_id, field_id, value) values
  ('mbr_sofiaaaaaaaaaaaaaaaaaaaaaa', 1, 'Italian, English, French'),
  ('mbr_tomaaaaaaaaaaaaaaaaaaaaaaa', 1, 'English, French'),
  ('mbr_inesaaaaaaaaaaaaaaaaaaaaaa', 1, 'French, Spanish'),
  ('mbr_noraaaaaaaaaaaaaaaaaaaaaaa', 2, to_char(current_date + 20, 'YYYY-MM-DD')),
  ('mbr_hugoaaaaaaaaaaaaaaaaaaaaaa', 2, to_char(current_date + 400, 'YYYY-MM-DD'));

-- HR records: the staff register in hiring order, an intern, someone
-- without the Chest (the warehouse), someone who left; Nora's trial period
-- ends soon.
insert into records (member_id, legal_name, sex, birth_date, nationality, job, qualification, contract, working_time, hours, start_date, trial_end, contract_end, end_date,
  work_permit, agency, tutor_id, workplace, emergency_name, emergency_relation, emergency_phone, address, created_by) values
  ('mbr_camilleaaaaaaaaaaaaaaaaaaa', 'MARTIN Camille Hélène', 'female', date '1984-04-18', 'Française', 'Office manager', 'Cadre, position 2.1', 'permanent', 'full', 35, date '2017-02-06', null, null, null,
   '', '', null, '', 'Julien Martin', 'Spouse', '+33 6 10 20 30 40', '14 rue Oberkampf
75011 Paris', 'mbr_camilleaaaaaaaaaaaaaaaaaaa'),
  (null, 'GIRAUD Paul', 'male', date '1979-09-02', 'Française', 'Warehouse operator', 'Ouvrier, niveau II coefficient 170', 'permanent', 'full', 35, date '2018-03-05', null, null, date '2024-06-28',
   '', '', null, '', '', '', '', '', 'mbr_camilleaaaaaaaaaaaaaaaaaaa'),
  ('mbr_inesaaaaaaaaaaaaaaaaaaaaaa', 'MOREAU Inès', 'female', date '1986-11-23', 'Française', 'Head of sales', 'Cadre, position 3.1', 'permanent', 'full', 35, date '2019-05-13', null, null, null,
   '', '', null, '', 'Carlos Moreau', 'Father', '+33 6 55 44 33 22', '', 'mbr_camilleaaaaaaaaaaaaaaaaaaa'),
  ('mbr_leaaaaaaaaaaaaaaaaaaaaaaaa', 'DUBOIS Léa', 'female', date '1992-07-08', 'Française', 'Lead developer', 'Cadre, position 2.2', 'permanent', 'full', 35, date '2020-10-01', null, null, null,
   '', '', null, '', '', '', '', '', 'mbr_camilleaaaaaaaaaaaaaaaaaaa'),
  (null, 'DIALLO Aminata', 'female', date '1995-01-30', 'Sénégalaise', 'Warehouse operator', 'Ouvrier, niveau I coefficient 150', 'fixed_term', 'part', 24, date '2023-09-04', null, current_date + 20, null,
   'Carte de séjour « salarié » n° 7512345678', '', null, '', 'Moussa Diallo', 'Brother', '+33 7 12 34 56 78', '', 'mbr_camilleaaaaaaaaaaaaaaaaaaa'),
  ('mbr_sofiaaaaaaaaaaaaaaaaaaaaaa', 'ROSSI Sofia', 'female', date '1996-03-14', 'Italienne', 'HR assistant', 'Employée, niveau 3', 'permanent', 'full', 35, date '2023-01-09', null, null, null,
   '', '', null, '', '', '', '', '', 'mbr_camilleaaaaaaaaaaaaaaaaaaa'),
  ('mbr_tomaaaaaaaaaaaaaaaaaaaaaaa', 'WALKER Thomas', 'male', date '1991-12-01', 'Britannique', 'Developer', '', 'seconded', 'full', 35, date '2024-03-04', null, null, null,
   'Titre de séjour « talent » n° 9912345678', 'Bristol Data Ltd
1 Harbour Road, Bristol BS1, United Kingdom', null, '', '', '', '', '', 'mbr_camilleaaaaaaaaaaaaaaaaaaa'),
  (null, 'NGUYEN Linh', 'female', date '2004-05-20', 'Française', 'Marketing intern', '', 'internship', 'full', 35, current_date - 40, null, current_date + 50, null,
   '', '', 'mbr_inesaaaaaaaaaaaaaaaaaaaaaa', 'Lyon office', '', '', '', '', 'mbr_camilleaaaaaaaaaaaaaaaaaaa'),
  ('mbr_noraaaaaaaaaaaaaaaaaaaaaaa', 'PETIT Nora', 'female', date '2000-02-11', 'Française', 'Sales assistant', 'Employée, niveau 2', 'permanent', 'full', 35, current_date - 6, current_date + 9, null, null,
   '', '', null, '', 'Anne Petit', 'Mother', '+33 6 77 88 99 00', '', 'mbr_camilleaaaaaaaaaaaaaaaaaaa');

insert into journal (at, actor, action, record_id, fields) values
  (now() - interval '6 days', 'mbr_camilleaaaaaaaaaaaaaaaaaaa', 'created', 9, '{}'),
  (now() - interval '6 days', 'mbr_camilleaaaaaaaaaaaaaaaaaaa', 'changed', 9, '{birthDate,nationality,qualification,trialEnd}'),
  (now() - interval '2 days', 'mbr_sofiaaaaaaaaaaaaaaaaaaaaaa', 'viewed', 9, '{}');
