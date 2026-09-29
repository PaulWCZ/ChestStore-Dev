-- Sample data for local runs and screenshots (never run by the Chest). The
-- member ids are those of the studio's dev harness (lab/chest-dev): Camille
-- (admin, organiser), Sofia (organiser), Inès, Hugo, Léa, Tom and Nora
-- (members).
--
--  1 Lunch on Friday        choice, open, 4 of 7 answered (Hugo has not), comments
--  2 Christmas party        date poll with times, closed, the date chosen, comments
--  3 Météo de l’équipe      the team pulse (Camille asked it in French, from
--                           the French template): anonymous, every week, round 5
--                           open (4 answers, results at the close); rounds
--                           1-4 (polls 6-9) closed, their trend shows
--  4 Plants for the office  multiple choice, open
--  5 Summer offsite         Camille's draft
-- 10 Open day stand         a sign-up sheet: 2 people per slot, one full

insert into series (id, organiser, every, first_day, at_time, next_at, created_at) overriding system value values
  (1, 'mbr_camilleaaaaaaaaaaaaaaaaaaa', 'week', current_date - 30, '09:00', ((current_date + 5)::timestamp + time '09:00') at time zone 'Europe/Paris', now() - interval '30 days');

insert into polls (id, kind, title, details, organiser, status, anonymous, results, everyone, groups, closes_at, opened_at, closed_at, closed_by_date, settled_at, reminded_at, final_option, final_at, created_at, updated_at, repeat, series_id, round, slots) overriding system value values
  (1, 'choice', 'Where shall we have lunch on Friday?', 'Team lunch at 12:30, the company pays. Suggest a place with “Other”.', 'mbr_sofiaaaaaaaaaaaaaaaaaaaaaa', 'open', false, 'live', true, '{}',
    ((current_date + 2)::timestamp + time '11:00') at time zone 'Europe/Paris', now() - interval '5 hours', null, false, null, null, null, null, now() - interval '5 hours', now() - interval '5 hours', null, null, null, null),
  (2, 'date', 'Christmas party', 'Dinner and games at Le Grand Comptoir. Tell us which evenings work for you.', 'mbr_camilleaaaaaaaaaaaaaaaaaaa', 'closed', false, 'live', true, '{}',
    ((current_date - 1)::timestamp + time '18:00') at time zone 'Europe/Paris', now() - interval '9 days', ((current_date - 1)::timestamp + time '18:00') at time zone 'Europe/Paris', true, now() - interval '1 day', now() - interval '2 days', null, null, now() - interval '9 days', now() - interval '1 day', null, null, null, null),
  (3, 'survey', 'Météo de l’équipe', 'Trente secondes, en tout anonymat : personne — pas même moi — ne peut voir qui a répondu quoi. Les résultats s’affichent pour tous à la fin de l’édition.', 'mbr_camilleaaaaaaaaaaaaaaaaaaa', 'open', true, 'closed', true, '{}',
    ((current_date + 5)::timestamp + time '09:00') at time zone 'Europe/Paris', ((current_date - 2)::timestamp + time '09:00') at time zone 'Europe/Paris', null, false, null, null, null, null, now() - interval '2 days', now() - interval '2 days', 'week', 1, 5, null),
  (4, 'choice', 'Which plants for the office?', 'We are ordering a few green friends for the windows. Pick all you like.', 'mbr_sofiaaaaaaaaaaaaaaaaaaaaaa', 'open', false, 'live', true, '{}',
    null, now() - interval '1 day', null, false, null, null, null, null, now() - interval '1 day', now() - interval '1 day', null, null, null, null),
  (5, 'choice', 'Summer offsite: sea or mountains?', '', 'mbr_camilleaaaaaaaaaaaaaaaaaaa', 'draft', false, 'closed', true, '{}',
    null, null, null, false, null, null, null, null, now() - interval '3 hours', now() - interval '3 hours', null, null, null, null),
  (6, 'survey', 'Météo de l’équipe', 'Trente secondes, en tout anonymat : personne — pas même moi — ne peut voir qui a répondu quoi. Les résultats s’affichent pour tous à la fin de l’édition.', 'mbr_camilleaaaaaaaaaaaaaaaaaaa', 'closed', true, 'closed', true, '{}',
    ((current_date - 23)::timestamp + time '09:00') at time zone 'Europe/Paris', ((current_date - 30)::timestamp + time '09:00') at time zone 'Europe/Paris', ((current_date - 23)::timestamp + time '09:00') at time zone 'Europe/Paris', true, ((current_date - 23)::timestamp + time '09:00') at time zone 'Europe/Paris', null, null, null, ((current_date - 30)::timestamp + time '09:00') at time zone 'Europe/Paris', ((current_date - 23)::timestamp + time '09:00') at time zone 'Europe/Paris', 'week', 1, 1, null),
  (7, 'survey', 'Météo de l’équipe', 'Trente secondes, en tout anonymat : personne — pas même moi — ne peut voir qui a répondu quoi. Les résultats s’affichent pour tous à la fin de l’édition.', 'mbr_camilleaaaaaaaaaaaaaaaaaaa', 'closed', true, 'closed', true, '{}',
    ((current_date - 16)::timestamp + time '09:00') at time zone 'Europe/Paris', ((current_date - 23)::timestamp + time '09:00') at time zone 'Europe/Paris', ((current_date - 16)::timestamp + time '09:00') at time zone 'Europe/Paris', true, ((current_date - 16)::timestamp + time '09:00') at time zone 'Europe/Paris', null, null, null, ((current_date - 23)::timestamp + time '09:00') at time zone 'Europe/Paris', ((current_date - 16)::timestamp + time '09:00') at time zone 'Europe/Paris', 'week', 1, 2, null),
  (8, 'survey', 'Météo de l’équipe', 'Trente secondes, en tout anonymat : personne — pas même moi — ne peut voir qui a répondu quoi. Les résultats s’affichent pour tous à la fin de l’édition.', 'mbr_camilleaaaaaaaaaaaaaaaaaaa', 'closed', true, 'closed', true, '{}',
    ((current_date - 9)::timestamp + time '09:00') at time zone 'Europe/Paris', ((current_date - 16)::timestamp + time '09:00') at time zone 'Europe/Paris', ((current_date - 9)::timestamp + time '09:00') at time zone 'Europe/Paris', true, ((current_date - 9)::timestamp + time '09:00') at time zone 'Europe/Paris', null, null, null, ((current_date - 16)::timestamp + time '09:00') at time zone 'Europe/Paris', ((current_date - 9)::timestamp + time '09:00') at time zone 'Europe/Paris', 'week', 1, 3, null),
  (9, 'survey', 'Météo de l’équipe', 'Trente secondes, en tout anonymat : personne — pas même moi — ne peut voir qui a répondu quoi. Les résultats s’affichent pour tous à la fin de l’édition.', 'mbr_camilleaaaaaaaaaaaaaaaaaaa', 'closed', true, 'closed', true, '{}',
    ((current_date - 2)::timestamp + time '09:00') at time zone 'Europe/Paris', ((current_date - 9)::timestamp + time '09:00') at time zone 'Europe/Paris', ((current_date - 2)::timestamp + time '09:00') at time zone 'Europe/Paris', true, ((current_date - 2)::timestamp + time '09:00') at time zone 'Europe/Paris', null, null, null, ((current_date - 9)::timestamp + time '09:00') at time zone 'Europe/Paris', ((current_date - 2)::timestamp + time '09:00') at time zone 'Europe/Paris', 'week', 1, 4, null),
  (10, 'date', 'Open day: who holds the stand?', 'Two people per slot at the Saturday open day. Say yes to the slots you can take.', 'mbr_sofiaaaaaaaaaaaaaaaaaaaaaa', 'open', false, 'live', true, '{}',
    ((current_date + 8)::timestamp + time '18:00') at time zone 'Europe/Paris', now() - interval '20 hours', null, false, null, null, null, null, now() - interval '20 hours', now() - interval '20 hours', null, null, null, 2);

insert into questions (id, poll_id, position, kind, text, multiple, other, low, high) overriding system value values
  (1, 1, 0, 'choice', '', false, true, '', ''),
  (2, 2, 0, 'date', '', true, false, '', ''),
  (3, 3, 0, 'scale', 'Comment s’est passée votre semaine ?', false, false, 'Difficile', 'Très bien'),
  (7, 3, 1, 'enps', 'Recommanderiez-vous notre entreprise à un ami comme lieu de travail ?', false, false, '', ''),
  (4, 3, 2, 'text', 'Quelque chose à nous dire ?', false, false, '', ''),
  (5, 4, 0, 'choice', '', true, false, '', ''),
  (6, 5, 0, 'choice', '', false, false, '', ''),
  (8, 6, 0, 'scale', 'Comment s’est passée votre semaine ?', false, false, 'Difficile', 'Très bien'),
  (9, 6, 1, 'enps', 'Recommanderiez-vous notre entreprise à un ami comme lieu de travail ?', false, false, '', ''),
  (10, 6, 2, 'text', 'Quelque chose à nous dire ?', false, false, '', ''),
  (11, 7, 0, 'scale', 'Comment s’est passée votre semaine ?', false, false, 'Difficile', 'Très bien'),
  (12, 7, 1, 'enps', 'Recommanderiez-vous notre entreprise à un ami comme lieu de travail ?', false, false, '', ''),
  (13, 7, 2, 'text', 'Quelque chose à nous dire ?', false, false, '', ''),
  (14, 8, 0, 'scale', 'Comment s’est passée votre semaine ?', false, false, 'Difficile', 'Très bien'),
  (15, 8, 1, 'enps', 'Recommanderiez-vous notre entreprise à un ami comme lieu de travail ?', false, false, '', ''),
  (16, 8, 2, 'text', 'Quelque chose à nous dire ?', false, false, '', ''),
  (17, 9, 0, 'scale', 'Comment s’est passée votre semaine ?', false, false, 'Difficile', 'Très bien'),
  (18, 9, 1, 'enps', 'Recommanderiez-vous notre entreprise à un ami comme lieu de travail ?', false, false, '', ''),
  (19, 9, 2, 'text', 'Quelque chose à nous dire ?', false, false, '', ''),
  (20, 10, 0, 'date', '', true, false, '', '');

insert into options (id, question_id, position, label, day, start_time, end_time) overriding system value values
  (1, 1, 0, 'Pizzeria Da Marco', null, null, null),
  (2, 1, 1, 'Sushi Kan', null, null, null),
  (3, 1, 2, 'The salad bar', null, null, null),
  (4, 2, 0, '', make_date(extract(year from now())::int, 12, 11), '19:00', '23:00'),
  (5, 2, 1, '', make_date(extract(year from now())::int, 12, 17), '19:00', '23:00'),
  (6, 2, 2, '', make_date(extract(year from now())::int, 12, 18), '19:00', '23:00'),
  (7, 2, 3, '', make_date(extract(year from now())::int, 12, 19), '12:00', '16:00'),
  (8, 5, 0, 'Monstera', null, null, null),
  (9, 5, 1, 'Snake plant', null, null, null),
  (10, 5, 2, 'Pothos', null, null, null),
  (11, 5, 3, 'Fiddle-leaf fig', null, null, null),
  (12, 5, 4, 'A cactus corner', null, null, null),
  (13, 6, 0, 'The sea', null, null, null),
  (14, 6, 1, 'The mountains', null, null, null),
  (15, 20, 0, '', current_date + 12, '10:00', '12:00'),
  (16, 20, 1, '', current_date + 12, '12:00', '14:00'),
  (17, 20, 2, '', current_date + 12, '14:00', '16:00'),
  (18, 20, 3, '', current_date + 12, '16:00', '18:00');

update polls set final_option = 6, final_at = now() - interval '20 hours' where id = 2;

insert into participants (id, poll_id, member) overriding system value values
  (1, 1, 'mbr_camilleaaaaaaaaaaaaaaaaaaa'),
  (2, 1, 'mbr_inesaaaaaaaaaaaaaaaaaaaaaa'),
  (3, 1, 'mbr_leaaaaaaaaaaaaaaaaaaaaaaaa'),
  (4, 1, 'mbr_tomaaaaaaaaaaaaaaaaaaaaaaa'),
  (5, 2, 'mbr_camilleaaaaaaaaaaaaaaaaaaa'),
  (6, 2, 'mbr_sofiaaaaaaaaaaaaaaaaaaaaaa'),
  (7, 2, 'mbr_inesaaaaaaaaaaaaaaaaaaaaaa'),
  (8, 2, 'mbr_hugoaaaaaaaaaaaaaaaaaaaaaa'),
  (9, 2, 'mbr_leaaaaaaaaaaaaaaaaaaaaaaaa'),
  (10, 2, 'mbr_tomaaaaaaaaaaaaaaaaaaaaaaa'),
  (11, 2, 'mbr_noraaaaaaaaaaaaaaaaaaaaaaa'),
  (12, 3, 'mbr_tomaaaaaaaaaaaaaaaaaaaaaaa'),
  (13, 3, 'mbr_inesaaaaaaaaaaaaaaaaaaaaaa'),
  (14, 3, 'mbr_noraaaaaaaaaaaaaaaaaaaaaaa'),
  (15, 3, 'mbr_camilleaaaaaaaaaaaaaaaaaaa'),
  (16, 4, 'mbr_inesaaaaaaaaaaaaaaaaaaaaaa'),
  (17, 4, 'mbr_hugoaaaaaaaaaaaaaaaaaaaaaa'),
  (18, 4, 'mbr_leaaaaaaaaaaaaaaaaaaaaaaaa'),
  (19, 4, 'mbr_camilleaaaaaaaaaaaaaaaaaaa'),
  (20, 4, 'mbr_noraaaaaaaaaaaaaaaaaaaaaaa'),
  (21, 6, 'mbr_leaaaaaaaaaaaaaaaaaaaaaaaa'),
  (22, 6, 'mbr_camilleaaaaaaaaaaaaaaaaaaa'),
  (23, 6, 'mbr_hugoaaaaaaaaaaaaaaaaaaaaaa'),
  (24, 6, 'mbr_tomaaaaaaaaaaaaaaaaaaaaaaa'),
  (25, 6, 'mbr_sofiaaaaaaaaaaaaaaaaaaaaaa'),
  (26, 6, 'mbr_inesaaaaaaaaaaaaaaaaaaaaaa'),
  (27, 7, 'mbr_noraaaaaaaaaaaaaaaaaaaaaaa'),
  (28, 7, 'mbr_tomaaaaaaaaaaaaaaaaaaaaaaa'),
  (29, 7, 'mbr_inesaaaaaaaaaaaaaaaaaaaaaa'),
  (30, 7, 'mbr_camilleaaaaaaaaaaaaaaaaaaa'),
  (31, 7, 'mbr_leaaaaaaaaaaaaaaaaaaaaaaaa'),
  (32, 7, 'mbr_hugoaaaaaaaaaaaaaaaaaaaaaa'),
  (33, 7, 'mbr_sofiaaaaaaaaaaaaaaaaaaaaaa'),
  (34, 8, 'mbr_sofiaaaaaaaaaaaaaaaaaaaaaa'),
  (35, 8, 'mbr_hugoaaaaaaaaaaaaaaaaaaaaaa'),
  (36, 8, 'mbr_tomaaaaaaaaaaaaaaaaaaaaaaa'),
  (37, 8, 'mbr_leaaaaaaaaaaaaaaaaaaaaaaaa'),
  (38, 8, 'mbr_inesaaaaaaaaaaaaaaaaaaaaaa'),
  (39, 9, 'mbr_camilleaaaaaaaaaaaaaaaaaaa'),
  (40, 9, 'mbr_noraaaaaaaaaaaaaaaaaaaaaaa'),
  (41, 9, 'mbr_leaaaaaaaaaaaaaaaaaaaaaaaa'),
  (42, 9, 'mbr_hugoaaaaaaaaaaaaaaaaaaaaaa'),
  (43, 9, 'mbr_inesaaaaaaaaaaaaaaaaaaaaaa'),
  (44, 9, 'mbr_tomaaaaaaaaaaaaaaaaaaaaaaa'),
  (45, 10, 'mbr_hugoaaaaaaaaaaaaaaaaaaaaaa'),
  (46, 10, 'mbr_inesaaaaaaaaaaaaaaaaaaaaaa'),
  (47, 10, 'mbr_tomaaaaaaaaaaaaaaaaaaaaaaa');

insert into answers (participant_id, question_id, option_id, value, text) values
  (1, 1, 1, null, null),
  (2, 1, 2, null, null),
  (3, 1, null, null, 'Le Petit Thaï, rue Oberkampf'),
  (4, 1, 1, null, null),
  -- Christmas party: 2 yes, 1 if need be, 0 no.
  (5, 2, 4, 2, null), (5, 2, 5, 0, null), (5, 2, 6, 2, null), (5, 2, 7, 1, null),
  (6, 2, 4, 1, null), (6, 2, 5, 2, null), (6, 2, 6, 2, null), (6, 2, 7, 0, null),
  (7, 2, 4, 0, null), (7, 2, 5, 2, null), (7, 2, 6, 2, null), (7, 2, 7, 2, null),
  (8, 2, 4, 2, null), (8, 2, 5, 0, null), (8, 2, 6, 1, null), (8, 2, 7, 0, null),
  (9, 2, 4, 2, null), (9, 2, 5, 1, null), (9, 2, 6, 2, null), (9, 2, 7, 1, null),
  (10, 2, 4, 0, null), (10, 2, 5, 2, null), (10, 2, 6, 2, null), (10, 2, 7, 2, null),
  (11, 2, 4, 2, null), (11, 2, 5, 0, null), (11, 2, 6, 2, null), (11, 2, 7, 0, null),
  -- Plants.
  (16, 5, 8, null, null), (16, 5, 10, null, null),
  (17, 5, 12, null, null),
  (18, 5, 8, null, null), (18, 5, 9, null, null), (18, 5, 10, null, null),
  (19, 5, 8, null, null), (19, 5, 11, null, null),
  (20, 5, 10, null, null), (20, 5, 9, null, null),
  -- The stand: Hugo and Inès took 10:00 (full), Inès 12:00, Tom 14:00.
  (45, 20, 15, 2, null), (45, 20, 16, 0, null), (45, 20, 17, 0, null), (45, 20, 18, 0, null),
  (46, 20, 15, 2, null), (46, 20, 16, 2, null), (46, 20, 17, 0, null), (46, 20, 18, 0, null),
  (47, 20, 15, 0, null), (47, 20, 16, 0, null), (47, 20, 17, 2, null), (47, 20, 18, 0, null);

-- The pulse, as anonymous polls keep it: counts and texts only.
insert into tallies (poll_id, question_id, key, count) values
  (6, 8, 'n', 6),
  (6, 8, 'v2', 1),
  (6, 8, 'v3', 3),
  (6, 8, 'v4', 2),
  (6, 9, 'n', 6),
  (6, 9, 'v5', 1),
  (6, 9, 'v6', 1),
  (6, 9, 'v7', 1),
  (6, 9, 'v8', 1),
  (6, 9, 'v9', 1),
  (6, 9, 'v10', 1),
  (6, 10, 'n', 2),
  (7, 11, 'n', 7),
  (7, 11, 'v3', 3),
  (7, 11, 'v4', 4),
  (7, 12, 'n', 7),
  (7, 12, 'v6', 1),
  (7, 12, 'v7', 1),
  (7, 12, 'v8', 2),
  (7, 12, 'v9', 2),
  (7, 12, 'v10', 1),
  (7, 13, 'n', 1),
  (8, 14, 'n', 5),
  (8, 14, 'v2', 2),
  (8, 14, 'v3', 2),
  (8, 14, 'v4', 1),
  (8, 15, 'n', 5),
  (8, 15, 'v4', 1),
  (8, 15, 'v6', 1),
  (8, 15, 'v7', 1),
  (8, 15, 'v8', 1),
  (8, 15, 'v9', 1),
  (8, 16, 'n', 3),
  (9, 17, 'n', 6),
  (9, 17, 'v3', 1),
  (9, 17, 'v4', 4),
  (9, 17, 'v5', 1),
  (9, 18, 'n', 6),
  (9, 18, 'v6', 1),
  (9, 18, 'v7', 1),
  (9, 18, 'v8', 1),
  (9, 18, 'v9', 2),
  (9, 18, 'v10', 1),
  (9, 19, 'n', 2),
  (3, 3, 'n', 4),
  (3, 3, 'v3', 1),
  (3, 3, 'v4', 2),
  (3, 3, 'v5', 1),
  (3, 7, 'n', 4),
  (3, 7, 'v6', 1),
  (3, 7, 'v8', 1),
  (3, 7, 'v9', 1),
  (3, 7, 'v10', 1),
  (3, 4, 'n', 1);

-- Round 4 per group (lib/teams.ts): the harness's groups are small (two
-- people each), so no team shows on its own — the page says so.
insert into group_tallies (poll_id, group_id, question_id, key, count) values
  (9, 'grp_officeaaaaaaaaaaaaaaaaaaaa', 17, 'n', 2), (9, 'grp_officeaaaaaaaaaaaaaaaaaaaa', 17, 'v4', 2),
  (9, 'grp_salesaaaaaaaaaaaaaaaaaaaaa', 17, 'n', 2), (9, 'grp_salesaaaaaaaaaaaaaaaaaaaaa', 17, 'v4', 1), (9, 'grp_salesaaaaaaaaaaaaaaaaaaaaa', 17, 'v5', 1),
  (9, 'grp_techaaaaaaaaaaaaaaaaaaaaaa', 17, 'n', 2), (9, 'grp_techaaaaaaaaaaaaaaaaaaaaaa', 17, 'v3', 1), (9, 'grp_techaaaaaaaaaaaaaaaaaaaaaa', 17, 'v4', 1);

insert into texts (poll_id, question_id, body, shuffle) values
  (6, 10, 'Les réunions du lundi s’éternisent.', 0),
  (6, 10, 'Beau lancement, merci à tous !', 1),
  (7, 13, 'La nouvelle machine à café a changé ma vie. Encore !', 0),
  (8, 16, 'Trop d’interruptions cette semaine.', 0),
  (8, 16, 'Partagez le plan du trimestre suivant un peu plus tôt.', 1),
  (8, 16, 'Une pièce calme pour les appels aiderait beaucoup.', 2),
  (9, 19, 'J’ai adoré la démo de vendredi.', 0),
  (9, 19, 'Moins de réunions le lundi matin, s’il vous plaît.', 1),
  (3, 4, 'Bienvenue aux nouveaux de l’équipe commerciale !', 0);

insert into comments (poll_id, author, body, created_at) values
  (1, 'mbr_leaaaaaaaaaaaaaaaaaaaaaaaa', 'Le Petit Thaï has a vegetarian menu, for those who asked.', now() - interval '3 hours'),
  (1, 'mbr_sofiaaaaaaaaaaaaaaaaaaaaaa', 'Good to know, thanks Léa!', now() - interval '2 hours'),
  (2, 'mbr_hugoaaaaaaaaaaaaaaaaaaaaaa', 'I can do the 18th, but only from 20:00.', now() - interval '4 days'),
  (10, 'mbr_tomaaaaaaaaaaaaaaaaaaaaaaa', 'I can bring the banner from the office.', now() - interval '6 hours');

select setval(pg_get_serial_sequence('polls', 'id'), (select max(id) from polls));
select setval(pg_get_serial_sequence('questions', 'id'), (select max(id) from questions));
select setval(pg_get_serial_sequence('options', 'id'), (select max(id) from options));
select setval(pg_get_serial_sequence('participants', 'id'), (select max(id) from participants));
select setval(pg_get_serial_sequence('series', 'id'), (select max(id) from series));
select setval(pg_get_serial_sequence('comments', 'id'), (select max(id) from comments));
