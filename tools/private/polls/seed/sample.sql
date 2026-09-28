-- Sample data for local runs and screenshots (never run by the Chest). The
-- member ids are those of the studio's dev harness (lab/chest-dev): Camille
-- (admin, organiser), Sofia (organiser), Inès, Hugo, Léa, Tom and Nora.
--
-- 1 Lunch on Friday      choice, open, 4 of 7 answered (Hugo has not)
-- 2 Christmas party      date poll with times, closed, the date chosen
-- 3 How was this quarter anonymous pulse (1–5 + free text), 6 answers
-- 4 Plants for the office multiple choice, open
-- 5 Summer offsite       Camille's draft

insert into polls (id, kind, title, details, organiser, status, anonymous, results, everyone, groups, closes_at, opened_at, closed_at, closed_by_date, settled_at, reminded_at, final_option, final_at, created_at, updated_at) overriding system value values
  (1, 'choice', 'Where shall we have lunch on Friday?', 'Team lunch at 12:30, the company pays. Suggest a place with “Other”.', 'mbr_sofiaaaaaaaaaaaaaaaaaaaaaa', 'open', false, 'live', true, '{}',
    ((current_date + 2)::timestamp + time '11:00') at time zone 'Europe/Paris', now() - interval '5 hours', null, false, null, null, null, null, now() - interval '5 hours', now() - interval '5 hours'),
  (2, 'date', 'Christmas party', 'Dinner and games at Le Grand Comptoir. Tell us which evenings work for you.', 'mbr_camilleaaaaaaaaaaaaaaaaaaa', 'closed', false, 'live', true, '{}',
    now() - interval '1 day', now() - interval '9 days', now() - interval '1 day', true, now() - interval '1 day', now() - interval '2 days', null, null, now() - interval '9 days', now() - interval '1 day'),
  (3, 'survey', 'How was this quarter?', 'Five seconds, fully anonymous. Nobody — not even me — can see who answered what.', 'mbr_camilleaaaaaaaaaaaaaaaaaaa', 'open', true, 'live', true, '{}',
    ((current_date + 4)::timestamp + time '18:00') at time zone 'Europe/Paris', now() - interval '2 days', null, false, null, null, null, null, now() - interval '2 days', now() - interval '2 days'),
  (4, 'choice', 'Which plants for the office?', 'We are ordering a few green friends for the windows. Pick all you like.', 'mbr_sofiaaaaaaaaaaaaaaaaaaaaaa', 'open', false, 'live', true, '{}',
    null, now() - interval '1 day', null, false, null, null, null, null, now() - interval '1 day', now() - interval '1 day'),
  (5, 'choice', 'Summer offsite: sea or mountains?', '', 'mbr_camilleaaaaaaaaaaaaaaaaaaa', 'draft', false, 'closed', true, '{}',
    null, null, null, false, null, null, null, null, now() - interval '3 hours', now() - interval '3 hours');

insert into questions (id, poll_id, position, kind, text, multiple, other, low, high) overriding system value values
  (1, 1, 0, 'choice', '', false, true, '', ''),
  (2, 2, 0, 'date', '', true, false, '', ''),
  (3, 3, 0, 'scale', 'Overall, how was this quarter for you?', false, false, 'Hard', 'Great'),
  (4, 3, 1, 'text', 'What one thing should we change?', false, false, '', ''),
  (5, 4, 0, 'choice', '', true, false, '', ''),
  (6, 5, 0, 'choice', '', false, false, '', '');

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
  (14, 6, 1, 'The mountains', null, null, null);

update polls set final_option = 6, final_at = now() - interval '20 hours' where id = 2;

insert into participants (id, poll_id, member) overriding system value values
  -- Lunch: four of seven.
  (1, 1, 'mbr_camilleaaaaaaaaaaaaaaaaaaa'),
  (2, 1, 'mbr_inesaaaaaaaaaaaaaaaaaaaaaa'),
  (3, 1, 'mbr_leaaaaaaaaaaaaaaaaaaaaaaaa'),
  (4, 1, 'mbr_tomaaaaaaaaaaaaaaaaaaaaaaa'),
  -- Christmas party: everyone.
  (5, 2, 'mbr_camilleaaaaaaaaaaaaaaaaaaa'),
  (6, 2, 'mbr_sofiaaaaaaaaaaaaaaaaaaaaaa'),
  (7, 2, 'mbr_inesaaaaaaaaaaaaaaaaaaaaaa'),
  (8, 2, 'mbr_hugoaaaaaaaaaaaaaaaaaaaaaa'),
  (9, 2, 'mbr_leaaaaaaaaaaaaaaaaaaaaaaaa'),
  (10, 2, 'mbr_tomaaaaaaaaaaaaaaaaaaaaaaa'),
  (11, 2, 'mbr_noraaaaaaaaaaaaaaaaaaaaaaa'),
  -- The pulse: six (no order, no link to the answers below).
  (12, 3, 'mbr_tomaaaaaaaaaaaaaaaaaaaaaaa'),
  (13, 3, 'mbr_inesaaaaaaaaaaaaaaaaaaaaaa'),
  (14, 3, 'mbr_noraaaaaaaaaaaaaaaaaaaaaaa'),
  (15, 3, 'mbr_camilleaaaaaaaaaaaaaaaaaaa'),
  (16, 3, 'mbr_leaaaaaaaaaaaaaaaaaaaaaaaa'),
  (17, 3, 'mbr_sofiaaaaaaaaaaaaaaaaaaaaaa'),
  -- Plants: five.
  (18, 4, 'mbr_inesaaaaaaaaaaaaaaaaaaaaaa'),
  (19, 4, 'mbr_hugoaaaaaaaaaaaaaaaaaaaaaa'),
  (20, 4, 'mbr_leaaaaaaaaaaaaaaaaaaaaaaaa'),
  (21, 4, 'mbr_camilleaaaaaaaaaaaaaaaaaaa'),
  (22, 4, 'mbr_noraaaaaaaaaaaaaaaaaaaaaaa');

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
  (18, 5, 8, null, null), (18, 5, 10, null, null),
  (19, 5, 12, null, null),
  (20, 5, 8, null, null), (20, 5, 9, null, null), (20, 5, 10, null, null),
  (21, 5, 8, null, null), (21, 5, 11, null, null),
  (22, 5, 10, null, null), (22, 5, 9, null, null);

-- The pulse, as an anonymous poll keeps it: counts and texts only.
insert into tallies (poll_id, question_id, key, count) values
  (3, 3, 'n', 6), (3, 3, 'v2', 1), (3, 3, 'v3', 1), (3, 3, 'v4', 3), (3, 3, 'v5', 1),
  (3, 4, 'n', 4);
insert into texts (poll_id, question_id, body, shuffle) values
  (3, 4, 'Fewer meetings on Monday mornings, please.', 0),
  (3, 4, 'The new coffee machine changed my life. More of that.', 1),
  (3, 4, 'Share the plan for next quarter a bit earlier.', 2),
  (3, 4, 'A quiet room for calls would help a lot.', 3);

select setval(pg_get_serial_sequence('polls', 'id'), (select max(id) from polls));
select setval(pg_get_serial_sequence('questions', 'id'), (select max(id) from questions));
select setval(pg_get_serial_sequence('options', 'id'), (select max(id) from options));
select setval(pg_get_serial_sequence('participants', 'id'), (select max(id) from participants));
