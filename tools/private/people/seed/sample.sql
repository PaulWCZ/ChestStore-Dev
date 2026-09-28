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

insert into templates (kind, name, created_by, created_at) values
  ('onboarding', 'Office newcomer', 'mbr_camilleaaaaaaaaaaaaaaaaaaa', now() - interval '60 days'),
  ('offboarding', 'Leaving', 'mbr_camilleaaaaaaaaaaaaaaaaaaa', now() - interval '60 days');

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

insert into journeys (kind, person_id, template_id, name, anchor, created_by, created_at) values
  ('onboarding', 'mbr_noraaaaaaaaaaaaaaaaaaaaaaa', 1, 'Office newcomer', current_date - 6, 'mbr_camilleaaaaaaaaaaaaaaaaaaa', now() - interval '21 days');

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
