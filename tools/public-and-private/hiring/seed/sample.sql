-- Sample data for local runs and screenshots (never run by the Chest): the
-- careers page of Atelier Martin, a furniture workshop in Lyon. The member
-- ids are those of the studio's dev harness (lab/chest-dev/cast.mjs):
-- Camille and Sofia recruit; Inès, Hugo and Léa interview. CVs are files
-- of the Chest and cannot be seeded: the flows upload one.
insert into settings (key, value) values
  ('intros', '{"en": "We design and build solid-wood furniture in our Lyon workshop — forty people who like things made well, and made to last. If one of these jobs speaks to you, tell us about yourself.", "fr": "Nous dessinons et fabriquons des meubles en bois massif dans notre atelier lyonnais — quarante personnes qui aiment les choses bien faites, et faites pour durer. Si l’un de ces postes vous parle, racontez-nous qui vous êtes."}'),
  ('website', '"https://atelier-martin.example/"'),
  ('country', '"FR"');

insert into jobs (id, slug, title, team, place, contract, remote, language, description, salary_min, salary_max, salary_currency, salary_period, salary_shown, state, created_by, created_at, updated_at, opened_at, closed_at) overriding system value values
  (1, 'senior-furniture-designer', 'Senior furniture designer', 'Design studio', 'Lyon', 'permanent', 'hybrid', 'en',
   E'You will draw the chairs, tables and shelves that leave our workshop for the next ten years — from the first sketch to the prototype on the bench.\n\n## What you will do\n- Design new collections with our cabinet makers, **in the workshop**, not only on screen\n- Turn sketches into production drawings (Rhino or SolidWorks)\n- Choose woods and finishes with our suppliers in the Jura\n- Present prototypes to our clients and retailers\n\n## Who we are looking for\n- **Five years or more** designing furniture that was actually built\n- A portfolio that shows your hands as much as your eye\n- French or English; we speak both at the bench\n\n## Why join us\nA small team, a real workshop, four days a week in Lyon and one at home. Profit-sharing, and every piece you draw ends up in someone''s home.',
   48000, 58000, 'EUR', 'year', true, 'open', 'mbr_camilleaaaaaaaaaaaaaaaaaaa', now() - interval '26 days', now() - interval '26 days', now() - interval '25 days', null),
  (2, 'sales-associate-lyon-showroom', 'Sales associate — Lyon showroom', 'Showroom', 'Lyon, Presqu''île', 'permanent', 'onsite', 'en',
   E'Our showroom on rue Mercière is where people sit on a chair before they buy it. You will welcome them, advise them and follow their order until the delivery.\n\n## What you will do\n- Welcome visitors and help them choose, measure and imagine\n- Prepare quotes and follow each order with the workshop\n- Keep the showroom beautiful: displays, samples, the window\n\n## Who we are looking for\n- Two years of sales in a shop, ideally furniture or design\n- You like people, and wood\n- Available on Saturdays (two days off in the week)',
   28000, 32000, 'EUR', 'year', true, 'open', 'mbr_sofiaaaaaaaaaaaaaaaaaaaaaa', now() - interval '18 days', now() - interval '18 days', now() - interval '17 days', null),
  (3, 'office-manager', 'Office manager', 'Bureau', 'Lyon', 'permanent', 'onsite', 'fr',
   E'Vous êtes le cœur de l''atelier : sans vous, rien ne part, rien n''arrive, et personne ne sait où sont les clés.\n\n## Vos missions\n- Accueillir les visiteurs, les livreurs et les nouveaux arrivants\n- Gérer les fournitures, les contrats d''entretien et le planning des salles\n- Préparer les éléments de paie avec notre expert-comptable\n- Organiser la vie de l''équipe : repas, fêtes, séminaire annuel\n\n## Le profil recherché\n- **Trois ans d''expérience** en assistanat ou en office management\n- Organisé, souriant, à l''aise avec les tableurs\n- Le goût des petites entreprises où l''on fait un peu de tout',
   30000, 34000, 'EUR', 'year', true, 'open', 'mbr_camilleaaaaaaaaaaaaaaaaaaa', now() - interval '9 days', now() - interval '9 days', now() - interval '8 days', null),
  (4, 'summer-workshop-intern', 'Summer workshop intern', 'Workshop', 'Lyon', 'internship', 'onsite', 'en',
   E'Two months at the bench with our cabinet makers, from June to August.\n\n- Sanding, assembling, finishing\n- A real piece of your own by the end of the summer',
   null, null, 'EUR', 'month', false, 'closed', 'mbr_camilleaaaaaaaaaaaaaaaaaaa', now() - interval '120 days', now() - interval '60 days', now() - interval '118 days', now() - interval '60 days');

-- Default stages are keys (preset), each reader sees them in their
-- language; the showroom job has two stages of its own, named by Sofia.
insert into stages (id, job_id, name, preset, position, hired) overriding system value values
  (1, 1, null, 'new', 0, false), (2, 1, null, 'screening', 1, false), (3, 1, null, 'interview', 2, false), (4, 1, null, 'offer', 3, false), (5, 1, null, 'hired', 4, true),
  (6, 2, null, 'new', 0, false), (7, 2, 'Phone call', null, 1, false), (8, 2, 'Showroom day', null, 2, false), (9, 2, null, 'offer', 3, false), (10, 2, null, 'hired', 4, true),
  (11, 3, null, 'new', 0, false), (12, 3, null, 'screening', 1, false), (13, 3, null, 'interview', 2, false), (14, 3, null, 'offer', 3, false), (15, 3, null, 'hired', 4, true),
  (16, 4, null, 'new', 0, false), (17, 4, null, 'interview', 1, false), (18, 4, null, 'hired', 2, true);

-- Where the jobs are (Google for Jobs and the feeds place them), and the
-- showroom's questions.
update jobs set postal_code = '69003', street = '14 rue des Tanneurs' where id in (1, 3, 4);
update jobs set postal_code = '69002', street = '8 rue Mercière' where id = 2;
update jobs set closes_on = (now() + interval '40 days')::date where id = 2;
update jobs set questions = '[{"id": "qsat1", "kind": "yesno", "label": "Can you work on Saturdays?", "options": [], "required": true}, {"id": "qstart2", "kind": "choice", "label": "When could you start?", "options": ["Right away", "Within a month", "Later"], "required": false}]' where id = 2;

insert into job_interviewers (job_id, member_id, added_by, added_at) values
  (1, 'mbr_inesaaaaaaaaaaaaaaaaaaaaaa', 'mbr_camilleaaaaaaaaaaaaaaaaaaa', now() - interval '24 days'),
  (1, 'mbr_hugoaaaaaaaaaaaaaaaaaaaaaa', 'mbr_camilleaaaaaaaaaaaaaaaaaaa', now() - interval '24 days'),
  (2, 'mbr_leaaaaaaaaaaaaaaaaaaaaaaaa', 'mbr_sofiaaaaaaaaaaaaaaaaaaaaaa', now() - interval '16 days'),
  (2, 'mbr_hugoaaaaaaaaaaaaaaaaaaaaaa', 'mbr_sofiaaaaaaaaaaaaaaaaaaaaaa', now() - interval '16 days'),
  (3, 'mbr_inesaaaaaaaaaaaaaaaaaaaaaa', 'mbr_camilleaaaaaaaaaaaaaaaaaaa', now() - interval '7 days');

insert into candidates (id, job_id, stage_id, status, name, email, phone, link, cover_letter, source, added_by, language, consent_at, stage_entered_at, reject_reason, rejected_at, created_at, last_activity_at) overriding system value values
  (1, 1, 3, 'active', 'Lucie Garnier', 'lucie.garnier@example.com', '+33 6 12 34 56 78', 'https://www.linkedin.com/in/lucie-garnier', E'I have spent six years at a chair maker in the Jura, drawing and building. I would love to design for a workshop that still has its hands in the wood.', 'careers', null, 'en', now() - interval '21 days', now() - interval '6 days', null, null, now() - interval '21 days', now() - interval '2 days'),
  (2, 1, 1, 'active', 'Mathis Laurent', 'mathis.laurent@example.com', '', 'https://mathislaurent.design', '', 'careers', null, 'fr', now() - interval '1 day', now() - interval '1 day', null, null, now() - interval '1 day', now() - interval '1 day'),
  (3, 1, 1, 'active', 'Aïcha Benali', 'aicha.benali@example.com', '+33 7 45 12 90 33', '', E'Designer at a Milan studio for four years, back in Lyon since the spring.', 'careers', null, 'en', now() - interval '3 hours', now() - interval '3 hours', null, null, now() - interval '3 hours', now() - interval '3 hours'),
  (4, 1, 2, 'active', 'Jonas Weber', 'jonas.weber@example.com', '+49 151 2345 6789', 'https://www.behance.net/jonasweber', '', 'careers', null, 'en', now() - interval '12 days', now() - interval '9 days', null, null, now() - interval '12 days', now() - interval '9 days'),
  (5, 1, 4, 'active', 'Clara Fontaine', 'clara.fontaine@example.com', '+33 6 98 76 54 32', 'https://clarafontaine.fr', E'Recommended by Hugo, with whom I studied at the Boulle school.', 'team', 'mbr_camilleaaaaaaaaaaaaaaaaaaa', 'fr', null, now() - interval '2 days', null, null, now() - interval '19 days', now() - interval '2 days'),
  (6, 1, 2, 'rejected', 'Théo Marchand', 'theo.marchand@example.com', '', '', '', 'careers', null, 'fr', now() - interval '15 days', now() - interval '14 days', 'experience', now() - interval '13 days', now() - interval '15 days', now() - interval '13 days'),
  (7, 1, 3, 'active', 'Emma Lefort', 'emma.lefort@example.com', '+33 6 22 33 44 55', 'https://www.linkedin.com/in/emmalefort', '', 'careers', null, 'en', now() - interval '16 days', now() - interval '4 days', null, null, now() - interval '16 days', now() - interval '1 day'),
  (8, 2, 6, 'active', 'Karim Haddad', 'karim.haddad@example.com', '+33 6 55 44 33 22', '', E'Five years at a design shop in Paris, moving to Lyon this winter.', 'careers', null, 'fr', now() - interval '5 hours', now() - interval '5 hours', null, null, now() - interval '5 hours', now() - interval '5 hours'),
  (9, 2, 7, 'active', 'Sarah Cohen', 'sarah.cohen@example.com', '+33 6 11 22 33 44', '', '', 'careers', null, 'en', now() - interval '10 days', now() - interval '7 days', null, null, now() - interval '10 days', now() - interval '7 days'),
  (10, 2, 8, 'active', 'Nicolas Petitjean', 'nicolas.petitjean@example.com', '+33 7 66 55 44 33', '', '', 'careers', null, 'fr', now() - interval '14 days', now() - interval '3 days', null, null, now() - interval '14 days', now() - interval '1 day'),
  (11, 2, 7, 'rejected', 'Julie Morel', 'julie.morel@example.com', '', '', '', 'careers', null, 'fr', now() - interval '13 days', now() - interval '12 days', 'salary', now() - interval '11 days', now() - interval '13 days', now() - interval '11 days'),
  (12, 3, 11, 'active', 'Manon Girard', 'manon.girard@example.com', '+33 6 77 88 99 00', '', E'Assistante de direction depuis cinq ans dans une PME de 30 personnes, je cherche un poste plus proche de l''équipe.', 'careers', null, 'fr', now() - interval '2 days', now() - interval '2 days', null, null, now() - interval '2 days', now() - interval '2 days'),
  (13, 3, 13, 'active', 'Hélène Vasseur', 'helene.vasseur@example.com', '+33 6 10 20 30 40', 'https://www.linkedin.com/in/helenevasseur', '', 'careers', null, 'fr', now() - interval '7 days', now() - interval '2 days', null, null, now() - interval '7 days', now() - interval '1 day'),
  (14, 4, 18, 'active', 'Paul Durand', 'paul.durand@example.com', '', '', '', 'careers', null, 'fr', now() - interval '110 days', now() - interval '75 days', null, null, now() - interval '110 days', now() - interval '75 days'),
  (15, 4, 17, 'rejected', 'Lina Ferreira', 'lina.ferreira@example.com', '', '', '', 'careers', null, 'en', now() - interval '100 days', now() - interval '90 days', 'filled', now() - interval '74 days', now() - interval '100 days', now() - interval '74 days');
-- Applications no longer ask for consent (the legal basis is the
-- employer's legitimate interest, README "Personal data"): no sample
-- candidate carries a consent date, so no page shows a stale "agreed to
-- be kept" line.
update candidates set consent_at = null;

-- Who opened what: Camille has seen all but the newest; Sofia, the sales job's.
insert into candidate_seen (candidate_id, member_id)
  select id, 'mbr_camilleaaaaaaaaaaaaaaaaaaa' from candidates where id not in (2, 3, 8, 12)
  union all select id, 'mbr_sofiaaaaaaaaaaaaaaaaaaaaaa' from candidates where job_id = 2 and id <> 8;

insert into feedback (candidate_id, author, rating, strengths, concerns, recommendation, created_at, updated_at) values
  (1, 'mbr_hugoaaaaaaaaaaaaaaaaaaaaaa', 4, 'Beautiful portfolio, and every piece in it was built. Knows joinery better than I do.', 'Has never worked with retailers.', 'strong_yes', now() - interval '3 days', now() - interval '3 days'),
  (1, 'mbr_camilleaaaaaaaaaaaaaaaaaaa', 3, 'Clear, calm, asks the right questions about production.', 'Salary expectations at the top of our range.', 'yes', now() - interval '3 days', now() - interval '3 days'),
  (5, 'mbr_inesaaaaaaaaaaaaaaaaaaaaaa', 4, 'Sketched a stool during the interview. Great eye for proportions.', '', 'strong_yes', now() - interval '6 days', now() - interval '6 days'),
  (5, 'mbr_hugoaaaaaaaaaaaaaaaaaaaaaa', 4, 'Knows our materials; the team liked her at once.', 'Can only start in January.', 'strong_yes', now() - interval '5 days', now() - interval '5 days'),
  (7, 'mbr_hugoaaaaaaaaaaaaaaaaaaaaaa', 2, 'Good software skills.', 'Little hands-on experience in a workshop.', 'no', now() - interval '2 days', now() - interval '2 days'),
  (10, 'mbr_leaaaaaaaaaaaaaaaaaaaaaaaa', 3, 'Warm with visitors during the showroom day, sold a table.', 'Needs to learn our catalogue.', 'yes', now() - interval '2 days', now() - interval '2 days'),
  (13, 'mbr_camilleaaaaaaaaaaaaaaaaaaa', 3, 'Très organisée, a déjà préparé la paie avec un cabinet.', 'Préavis de trois mois.', 'yes', now() - interval '1 day', now() - interval '1 day'),
  (14, 'mbr_hugoaaaaaaaaaaaaaaaaaaaaaa', 4, 'Careful and curious.', '', 'strong_yes', now() - interval '80 days', now() - interval '80 days');

insert into feedback_requests (candidate_id, member_id, requested_by, requested_at) values
  (7, 'mbr_inesaaaaaaaaaaaaaaaaaaaaaa', 'mbr_camilleaaaaaaaaaaaaaaaaaaa', now() - interval '1 day'),
  (1, 'mbr_inesaaaaaaaaaaaaaaaaaaaaaa', 'mbr_camilleaaaaaaaaaaaaaaaaaaa', now() - interval '2 days'),
  (13, 'mbr_inesaaaaaaaaaaaaaaaaaaaaaa', 'mbr_camilleaaaaaaaaaaaaaaaaaaa', now() - interval '1 day');

insert into notes (candidate_id, author, body, created_at) values
  (1, 'mbr_camilleaaaaaaaaaaaaaaaaaaa', 'Called her: available from 1 December, would move from Besançon.', now() - interval '5 days'),
  (5, 'mbr_camilleaaaaaaaaaaaaaaaaaaa', 'Offer sent on Monday: 52k, start 6 January. Answer expected by Friday.', now() - interval '2 days'),
  (10, 'mbr_sofiaaaaaaaaaaaaaaaaaaaaaa', 'Showroom day went well. Check references with his last shop.', now() - interval '1 day'),
  (13, 'mbr_camilleaaaaaaaaaaaaaaaaaaa', 'Deuxième entretien avec Inès à caler la semaine prochaine.', now() - interval '1 day');

insert into activity (candidate_id, actor, kind, data, created_at) values
  (1, null, 'applied', '{}', now() - interval '21 days'),
  (1, null, 'emailed', '{"kind": "confirmation"}', now() - interval '21 days'),
  (1, 'mbr_camilleaaaaaaaaaaaaaaaaaaa', 'moved', '{"from": null, "fromPreset": "new", "to": null, "toPreset": "screening"}', now() - interval '18 days'),
  (1, 'mbr_camilleaaaaaaaaaaaaaaaaaaa', 'moved', '{"from": null, "fromPreset": "screening", "to": null, "toPreset": "interview"}', now() - interval '6 days'),
  (1, 'mbr_hugoaaaaaaaaaaaaaaaaaaaaaa', 'feedback', '{}', now() - interval '3 days'),
  (1, 'mbr_camilleaaaaaaaaaaaaaaaaaaa', 'feedback', '{}', now() - interval '3 days'),
  (1, 'mbr_camilleaaaaaaaaaaaaaaaaaaa', 'asked', '{"members": ["mbr_inesaaaaaaaaaaaaaaaaaaaaaa"]}', now() - interval '2 days'),
  (2, null, 'applied', '{}', now() - interval '1 day'),
  (3, null, 'applied', '{}', now() - interval '3 hours'),
  (4, null, 'applied', '{}', now() - interval '12 days'),
  (4, 'mbr_camilleaaaaaaaaaaaaaaaaaaa', 'moved', '{"from": null, "fromPreset": "new", "to": null, "toPreset": "screening"}', now() - interval '9 days'),
  (5, 'mbr_camilleaaaaaaaaaaaaaaaaaaa', 'added', '{"stage": null, "preset": "screening"}', now() - interval '19 days'),
  (5, 'mbr_camilleaaaaaaaaaaaaaaaaaaa', 'moved', '{"from": null, "fromPreset": "screening", "to": null, "toPreset": "interview"}', now() - interval '10 days'),
  (5, 'mbr_inesaaaaaaaaaaaaaaaaaaaaaa', 'feedback', '{}', now() - interval '6 days'),
  (5, 'mbr_hugoaaaaaaaaaaaaaaaaaaaaaa', 'feedback', '{}', now() - interval '5 days'),
  (5, 'mbr_camilleaaaaaaaaaaaaaaaaaaa', 'moved', '{"from": null, "fromPreset": "interview", "to": null, "toPreset": "offer"}', now() - interval '2 days'),
  (6, null, 'applied', '{}', now() - interval '15 days'),
  (6, 'mbr_camilleaaaaaaaaaaaaaaaaaaa', 'moved', '{"from": null, "fromPreset": "new", "to": null, "toPreset": "screening"}', now() - interval '14 days'),
  (6, 'mbr_camilleaaaaaaaaaaaaaaaaaaa', 'rejected', '{"reason": "experience"}', now() - interval '13 days'),
  (6, 'mbr_camilleaaaaaaaaaaaaaaaaaaa', 'emailed', '{"kind": "rejection"}', now() - interval '13 days'),
  (7, null, 'applied', '{}', now() - interval '16 days'),
  (7, 'mbr_camilleaaaaaaaaaaaaaaaaaaa', 'moved', '{"from": null, "fromPreset": "screening", "to": null, "toPreset": "interview"}', now() - interval '4 days'),
  (7, 'mbr_hugoaaaaaaaaaaaaaaaaaaaaaa', 'feedback', '{}', now() - interval '2 days'),
  (7, 'mbr_camilleaaaaaaaaaaaaaaaaaaa', 'asked', '{"members": ["mbr_inesaaaaaaaaaaaaaaaaaaaaaa"]}', now() - interval '1 day'),
  (8, null, 'applied', '{}', now() - interval '5 hours'),
  (9, null, 'applied', '{}', now() - interval '10 days'),
  (9, 'mbr_sofiaaaaaaaaaaaaaaaaaaaaaa', 'moved', '{"from": null, "fromPreset": "new", "to": "Phone call"}', now() - interval '7 days'),
  (10, null, 'applied', '{}', now() - interval '14 days'),
  (10, 'mbr_sofiaaaaaaaaaaaaaaaaaaaaaa', 'moved', '{"from": "Phone call", "to": "Showroom day"}', now() - interval '3 days'),
  (10, 'mbr_leaaaaaaaaaaaaaaaaaaaaaaaa', 'feedback', '{}', now() - interval '2 days'),
  (11, null, 'applied', '{}', now() - interval '13 days'),
  (11, 'mbr_sofiaaaaaaaaaaaaaaaaaaaaaa', 'rejected', '{"reason": "salary"}', now() - interval '11 days'),
  (12, null, 'applied', '{}', now() - interval '2 days'),
  (13, null, 'applied', '{}', now() - interval '7 days'),
  (13, 'mbr_camilleaaaaaaaaaaaaaaaaaaa', 'moved', '{"from": null, "fromPreset": "new", "to": null, "toPreset": "interview"}', now() - interval '2 days'),
  (13, 'mbr_camilleaaaaaaaaaaaaaaaaaaa', 'feedback', '{}', now() - interval '1 day'),
  (14, null, 'applied', '{}', now() - interval '110 days'),
  (14, 'mbr_camilleaaaaaaaaaaaaaaaaaaa', 'moved', '{"from": null, "fromPreset": "interview", "to": null, "toPreset": "hired"}', now() - interval '75 days'),
  (15, null, 'applied', '{}', now() - interval '100 days'),
  (15, 'mbr_camilleaaaaaaaaaaaaaaaaaaa', 'rejected', '{"reason": "filled"}', now() - interval '74 days');

-- Some agreed to be kept in mind for other jobs; Julie answered her
-- rejection; an interview is planned with Lucie; a template of the team.
update candidates set pool_at = created_at where id in (1, 4, 7, 11, 13);
update candidates set answers = '[{"id": "qsat1", "label": "Can you work on Saturdays?", "answer": "yes"}, {"id": "qstart2", "label": "When could you start?", "answer": "Within a month"}]' where id = 8;
insert into messages (candidate_id, direction, kind, author, subject, body, status, created_at, sent_at) values
  (1, 'out', 'confirmation', null, 'We received your application — Senior furniture designer', E'Hello Lucie Garnier,\n\nThank you for applying for Senior furniture designer at Atelier Martin. Your application has reached the team: we read every one, and we will write to you, whatever our answer.\n\nAtelier Martin', 'sent', now() - interval '21 days', now() - interval '21 days'),
  (1, 'out', 'message', 'mbr_camilleaaaaaaaaaaaaaaaaaaa', 'Your application — Senior furniture designer', E'Hello Lucie,\n\nThank you for applying for the Senior furniture designer position. We would like to talk with you: when are you free next week for a 30-minute call?\n\nCamille\nAtelier Martin', 'sent', now() - interval '18 days', now() - interval '18 days'),
  (1, 'in', 'message', null, 'Re: Your application — Senior furniture designer', E'Hello Camille,\n\nThank you! Tuesday or Wednesday afternoon works for me.\n\nLucie', 'received', now() - interval '17 days', null),
  (11, 'in', 'message', null, 'Re: Your application — Sales associate — Lyon showroom', E'Bonjour,\n\nMerci pour votre réponse. N’hésitez pas à me recontacter si un poste se libère.\n\nJulie', 'received', now() - interval '10 days', null);
update messages set from_address = 'lucie.garnier@example.com', from_name = 'Lucie Garnier', authenticated = true where candidate_id = 1 and direction = 'in';
insert into messages (candidate_id, direction, kind, author, subject, body, status, from_address, from_name, authenticated, created_at) values
  (null, 'in', 'message', null, 'CV for the showroom job', E'Hello,\n\nA friend told me about your showroom job. My CV is attached; I can come by any day.\n\nThomas Roux', 'received', 'thomas.roux@example.com', 'Thomas Roux', true, now() - interval '4 hours');
update messages set from_address = 'julie.morel@example.com', from_name = 'Julie Morel', authenticated = true where candidate_id = 11 and direction = 'in';
insert into activity (candidate_id, actor, kind, data, created_at) values
  (1, 'mbr_camilleaaaaaaaaaaaaaaaaaaa', 'wrote', '{"kind": "message"}', now() - interval '18 days'),
  (1, null, 'replied', '{"auto": false}', now() - interval '17 days'),
  (11, null, 'replied', '{"auto": false}', now() - interval '10 days');
-- Days and hours are the Chest's: the database session is in its zone,
-- so date_trunc('day', now()) is its midnight (14:00 is 14:00 there).
insert into interviews (id, candidate_id, starts_at, ends_at, place, note, created_by, calendar) overriding system value values
  (1, 1, date_trunc('day', now()) + interval '2 days 14 hours', date_trunc('day', now()) + interval '2 days 15 hours', 'Atelier Martin, 14 rue des Tanneurs, Lyon', 'Bring a few pieces of your portfolio.', 'mbr_camilleaaaaaaaaaaaaaaaaaaa', 'pending'),
  (2, 13, date_trunc('day', now()) + interval '3 days 10 hours', date_trunc('day', now()) + interval '3 days 11 hours', 'Atelier Martin, 14 rue des Tanneurs, Lyon', '', 'mbr_camilleaaaaaaaaaaaaaaaaaaa', 'pending'),
  -- This morning at 09:00 in the Chest's zone (the zone of the database
  -- session, as on a Chest), whatever the hour the sample is loaded: the
  -- interviewers' morning reminder always has a day to tell.
  (3, 8, date_trunc('day', now()) + interval '9 hours', date_trunc('day', now()) + interval '9 hours 45 minutes', 'Showroom, rue Mercière, Lyon', '', 'mbr_sofiaaaaaaaaaaaaaaaaaaaaaa', 'pending');
insert into interview_people (interview_id, member_id) values
  (1, 'mbr_camilleaaaaaaaaaaaaaaaaaaa'), (1, 'mbr_hugoaaaaaaaaaaaaaaaaaaaaaa'),
  (2, 'mbr_inesaaaaaaaaaaaaaaaaaaaaaa'),
  (3, 'mbr_hugoaaaaaaaaaaaaaaaaaaaaaa'), (3, 'mbr_inesaaaaaaaaaaaaaaaaaaaaaa');
insert into activity (candidate_id, actor, kind, data, created_at) values
  (1, 'mbr_camilleaaaaaaaaaaaaaaaaaaa', 'interview', jsonb_build_object('at', to_char((date_trunc('day', now()) + interval '2 days 14 hours') at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), 'people', jsonb_build_array('mbr_camilleaaaaaaaaaaaaaaaaaaa', 'mbr_hugoaaaaaaaaaaaaaaaaaaaaaa')), now() - interval '1 day');
insert into templates (name, language, subject, body, created_by) values
  ('Showroom day invitation', 'en', 'A day in our showroom — {job}', E'Hello {firstName},\n\nWe would like you to spend a day with us in the showroom, rue Mercière: you will meet the team and a few of our clients. Which day suits you next week?\n\n{sender}\n{company}', 'mbr_sofiaaaaaaaaaaaaaaaaaaaaaa');

select setval(pg_get_serial_sequence('jobs', 'id'), 100);
select setval(pg_get_serial_sequence('interviews', 'id'), 100);
select setval(pg_get_serial_sequence('stages', 'id'), 100);
select setval(pg_get_serial_sequence('candidates', 'id'), 100);
