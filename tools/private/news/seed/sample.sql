-- Sample data for local runs and screenshots (never run by the Chest): the
-- last month of a seven-person company. The member ids are those of the
-- studio's dev harness (lab/chest-dev/cast.mjs): Camille and Sofia publish,
-- the others read. Times are relative to today, at office hours on the
-- Chest's clock (pg_temp.at: N days ago, at that time in the Chest's zone,
-- which the Chest makes the database session's), so the page always looks
-- current and nothing reads as written at 2 a.m.
create function pg_temp.at(days integer, t time) returns timestamptz language sql as $$
  select ((current_date - days) + t)::timestamptz
$$;

insert into posts (kind, title, body, locale, author, important, pinned_at, pinned_until, publish_at, created_at, announced_at, edited_at, text_version, event_day, event_start, event_end, place, seats, welcome) values
  ('announcement', 'Q3 is closed: thank you all',
   E'We closed the third quarter **12 % above plan**. Thank you, all of you, for a demanding summer.\n\nThe details are in the shared folder. We will talk about Q4 at the next team breakfast.',
   'en', 'mbr_camilleaaaaaaaaaaaaaaaaaaa', false, null, null, pg_temp.at(26, '09:40'), pg_temp.at(26, '09:40'), pg_temp.at(26, '09:40'), null, 1, null, null, null, null, null, null),
  ('info', 'The Wi-Fi password changes on Monday',
   E'For security, the office Wi-Fi password changes every quarter. From Monday, look at the card by the coffee machine.\n\nGuests keep using the _Guest_ network.',
   'en', 'mbr_sofiaaaaaaaaaaaaaaaaaaaaaa', false, null, null, pg_temp.at(19, '11:05'), pg_temp.at(19, '11:05'), pg_temp.at(19, '11:05'), null, 1, null, null, null, null, null, null),
  ('event', 'Team dinner at Le Petit Zinc',
   E'Let''s celebrate the quarter together! Dinner is on the company.\n\n- Vegetarian menu available\n- Partners welcome, tell Sofia by Friday\n\nSay below if you are coming, so we can book the right table.',
   'en', 'mbr_sofiaaaaaaaaaaaaaaaaaaaaaa', false, null, null, pg_temp.at(10, '14:20'), pg_temp.at(10, '14:20'), pg_temp.at(10, '14:20'), null, 1,
   current_date + 12, (current_date + 12 + time '19:30')::timestamptz, (current_date + 12 + time '23:00')::timestamptz, 'Le Petit Zinc, 11 rue Saint-Benoît, Paris 6e', null, null),
  ('announcement', 'We are moving on 2 November',
   E'After six years in rue du Faubourg, we move to **14 rue des Arts**, 3rd floor — twice the space, a real meeting room and a terrace.\n\n## What changes for you\n- Pack your desk on **Friday 30 October** (boxes arrive on Monday)\n- The office is closed on Monday 2 November: work from home\n- Your new badge is on your desk from Tuesday\n\nQuestions? Ask Camille or reply below.',
   'en', 'mbr_camilleaaaaaaaaaaaaaaaaaaa', true, pg_temp.at(6, '10:00'), pg_temp.at(-10, '00:00'), pg_temp.at(6, '10:00'), pg_temp.at(6, '09:52'), pg_temp.at(6, '10:00'), pg_temp.at(6, '10:25'), 2, null, null, null, null, null, null),
  ('welcome', 'Welcome to Nora, our new designer!',
   E'Nora joins us today as our **product designer**. She spent four years at a design studio in Lyon, and she draws the best maps you have ever seen.\n\nShe sits next to Léa. Come and say hello — and show her where the good coffee is.',
   'en', 'mbr_sofiaaaaaaaaaaaaaaaaaaaaaa', false, null, null, pg_temp.at(3, '09:15'), pg_temp.at(3, '09:15'), pg_temp.at(3, '09:15'), null, 1, null, null, null, null, null, 'mbr_noraaaaaaaaaaaaaaaaaaaaaaa'),
  ('info', 'Expense claims: send them by the 25th',
   E'To be paid with your salary, send your expense claims **before the 25th** of the month, with the receipts.\n\nThe form is in the accounting folder: [expense claims guide](https://example.com/expenses).',
   'en', 'mbr_camilleaaaaaaaaaaaaaaaaaaa', false, null, null, pg_temp.at(2, '16:30'), pg_temp.at(2, '16:30'), pg_temp.at(2, '16:30'), null, 1, null, null, null, null, null, null),
  ('announcement', 'Office closed for the holidays',
   E'The office closes from **24 December to 1 January**. Enjoy the break!',
   'en', 'mbr_camilleaaaaaaaaaaaaaaaaaaa', false, null, null, pg_temp.at(-2, '09:00'), now() - interval '1 hour', null, null, 1, null, null, null, null, null, null),
  ('info', 'Sales: our Q4 targets',
   E'The targets for the last quarter are in the sales folder: **+8 % on renewals**, two new regions.\n\nKick-off lunch on Thursday at noon, in the new meeting room.',
   'en', 'mbr_camilleaaaaaaaaaaaaaaaaaaa', false, null, null, pg_temp.at(1, '08:50'), pg_temp.at(1, '08:50'), pg_temp.at(1, '08:50'), null, 1, null, null, null, null, null, null),
  ('event', 'First-aid training: 3 places',
   E'A certified trainer teaches the basics of first aid in one morning: calling for help, the recovery position, CPR and the defibrillator.\n\nThree places: past them, you join the waiting list and hear from us if a place frees up.',
   'en', 'mbr_sofiaaaaaaaaaaaaaaaaaaaaaa', false, null, null, pg_temp.at(1, '15:10'), pg_temp.at(1, '15:10'), pg_temp.at(1, '15:10'), null, 1,
   current_date + 20, (current_date + 20 + time '09:00')::timestamptz, (current_date + 20 + time '12:30')::timestamptz, 'The new meeting room, 3rd floor', 3, null),
  ('info', 'Design review with the client on Friday',
   E'Hugo, Léa: the client comes on Friday at 14:00 to see the new screens. Bring your laptop; Nora presents.',
   'en', 'mbr_sofiaaaaaaaaaaaaaaaaaaaaaa', false, null, null, pg_temp.at(1, '17:50'), pg_temp.at(1, '17:50'), pg_temp.at(1, '17:50'), null, 1, null, null, null, null, null, null);

-- Posts in order: 1 Q3, 2 Wi-Fi, 3 dinner, 4 move (Important, in English
-- and French, edited once), 5 welcome, 6 expenses, 7 holidays (scheduled),
-- 8 Sales only, 9 first aid (3 places, one waiting), 10 for three people.
insert into post_groups (post_id, group_id) values (8, 'grp_salesaaaaaaaaaaaaaaaaaaaaa');
insert into post_people (post_id, member) values
  (10, 'mbr_hugoaaaaaaaaaaaaaaaaaaaaaa'),
  (10, 'mbr_leaaaaaaaaaaaaaaaaaaaaaaaa'),
  (10, 'mbr_noraaaaaaaaaaaaaaaaaaaaaaa');

insert into post_versions (post_id, locale, title, body) values
  (4, 'fr', 'Nous déménageons le 2 novembre',
   E'Après six ans rue du Faubourg, nous nous installons au **14 rue des Arts**, 3e étage : deux fois plus de place, une vraie salle de réunion et une terrasse.\n\n## Ce qui change pour vous\n- Faites vos cartons le **vendredi 30 octobre** (les cartons arrivent lundi)\n- Le bureau est fermé le lundi 2 novembre : télétravail\n- Votre nouveau badge vous attend sur votre bureau dès mardi\n\nDes questions ? Demandez à Camille ou répondez ci-dessous.'),
  (1, 'fr', 'Le T3 est clos : merci à tous',
   E'Nous avons clos le troisième trimestre **12 % au-dessus du plan**. Merci à chacun pour cet été exigeant.\n\nLe détail est dans le dossier partagé. Nous parlerons du T4 au prochain petit-déjeuner d’équipe.');

-- The move's first version (a date was wrong), kept when it was edited.
insert into revisions (post_id, version, locale, title, body, versions, edited_by, replaced_at) values
  (4, 1, 'en', 'We are moving on 2 November',
   E'After six years in rue du Faubourg, we move to **14 rue des Arts**, 3rd floor.\n\n- Pack your desk on **Friday 23 October**\n- The office is closed on Monday 2 November',
   '[]', 'mbr_camilleaaaaaaaaaaaaaaaaaaa', pg_temp.at(6, '10:25'));

insert into confirmations (post_id, member, at, version) values
  (4, 'mbr_hugoaaaaaaaaaaaaaaaaaaaaaa', pg_temp.at(6, '10:40'), 2),
  (4, 'mbr_leaaaaaaaaaaaaaaaaaaaaaaaa', pg_temp.at(5, '09:12'), 2),
  (4, 'mbr_sofiaaaaaaaaaaaaaaaaaaaaaa', pg_temp.at(5, '13:02'), 2);

-- Who was sent the move by email (a delivery, never a reading).
insert into emails (post_id, member, version, at) values
  (4, 'mbr_hugoaaaaaaaaaaaaaaaaaaaaaa', 1, pg_temp.at(6, '10:00')),
  (4, 'mbr_inesaaaaaaaaaaaaaaaaaaaaaa', 1, pg_temp.at(6, '10:00')),
  (4, 'mbr_leaaaaaaaaaaaaaaaaaaaaaaaa', 1, pg_temp.at(6, '10:00')),
  (4, 'mbr_sofiaaaaaaaaaaaaaaaaaaaaaa', 1, pg_temp.at(6, '10:00')),
  (4, 'mbr_tomaaaaaaaaaaaaaaaaaaaaaaa', 1, pg_temp.at(6, '10:00'));
insert into chest_state (key, value) values ('mail', 'on'), ('calendar', 'on');

insert into rsvps (post_id, member, answer, at) values
  (3, 'mbr_camilleaaaaaaaaaaaaaaaaaaa', 'yes', pg_temp.at(9, '09:30')),
  (3, 'mbr_hugoaaaaaaaaaaaaaaaaaaaaaa', 'yes', pg_temp.at(9, '10:05')),
  (3, 'mbr_leaaaaaaaaaaaaaaaaaaaaaaaa', 'yes', pg_temp.at(8, '11:20')),
  (3, 'mbr_tomaaaaaaaaaaaaaaaaaaaaaaa', 'no', pg_temp.at(7, '17:45')),
  (3, 'mbr_noraaaaaaaaaaaaaaaaaaaaaaa', 'yes', pg_temp.at(2, '12:10')),
  (9, 'mbr_leaaaaaaaaaaaaaaaaaaaaaaaa', 'yes', pg_temp.at(1, '15:30')),
  (9, 'mbr_tomaaaaaaaaaaaaaaaaaaaaaaa', 'yes', pg_temp.at(1, '15:42')),
  (9, 'mbr_camilleaaaaaaaaaaaaaaaaaaa', 'yes', pg_temp.at(1, '16:05')),
  (9, 'mbr_noraaaaaaaaaaaaaaaaaaaaaaa', 'wait', pg_temp.at(1, '17:20'));

insert into reactions (post_id, member, emoji, at) values
  (1, 'mbr_hugoaaaaaaaaaaaaaaaaaaaaaa', 'party', pg_temp.at(26, '10:02')),
  (1, 'mbr_inesaaaaaaaaaaaaaaaaaaaaaa', 'clap', pg_temp.at(26, '10:30')),
  (1, 'mbr_tomaaaaaaaaaaaaaaaaaaaaaaa', 'clap', pg_temp.at(25, '09:10')),
  (3, 'mbr_leaaaaaaaaaaaaaaaaaaaaaaaa', 'heart', pg_temp.at(9, '09:40')),
  (3, 'mbr_hugoaaaaaaaaaaaaaaaaaaaaaa', 'party', pg_temp.at(9, '10:06')),
  (4, 'mbr_inesaaaaaaaaaaaaaaaaaaaaaa', 'thumbs', pg_temp.at(6, '11:00')),
  (4, 'mbr_tomaaaaaaaaaaaaaaaaaaaaaaa', 'party', pg_temp.at(5, '09:30')),
  (5, 'mbr_camilleaaaaaaaaaaaaaaaaaaa', 'heart', pg_temp.at(3, '09:20')),
  (5, 'mbr_hugoaaaaaaaaaaaaaaaaaaaaaa', 'heart', pg_temp.at(3, '09:35')),
  (5, 'mbr_leaaaaaaaaaaaaaaaaaaaaaaaa', 'party', pg_temp.at(3, '10:10')),
  (5, 'mbr_inesaaaaaaaaaaaaaaaaaaaaaa', 'clap', pg_temp.at(3, '11:45')),
  (5, 'mbr_tomaaaaaaaaaaaaaaaaaaaaaaa', 'smile', pg_temp.at(2, '09:05')),
  (6, 'mbr_hugoaaaaaaaaaaaaaaaaaaaaaa', 'thumbs', pg_temp.at(1, '09:30'));

insert into comments (post_id, author, body, created_at) values
  (4, 'mbr_inesaaaaaaaaaaaaaaaaaaaaaa', 'Is there parking for bikes at the new place?', pg_temp.at(5, '10:15')),
  (4, 'mbr_leaaaaaaaaaaaaaaaaaaaaaaaa', 'Génial ! @[mbr_sofiaaaaaaaaaaaaaaaaaaaaaa], qui s’occupe du déménagement des plantes ?', pg_temp.at(4, '14:40')),
  (8, 'mbr_inesaaaaaaaaaaaaaaaaaaaaaa', 'Merci ! On prépare les chiffres pour jeudi.', pg_temp.at(1, '11:30')),
  (5, 'mbr_leaaaaaaaaaaaaaaaaaaaaaaaa', 'Welcome Nora! Lunch on Thursday?', pg_temp.at(3, '10:20')),
  (5, 'mbr_hugoaaaaaaaaaaaaaaaaaaaaaa', 'Welcome aboard!', pg_temp.at(3, '11:15')),
  (3, 'mbr_tomaaaaaaaaaaaaaaaaaaaaaaa', 'I''m in Berlin that week, have a great evening!', pg_temp.at(7, '17:46'));
-- Replies: one level under a comment.
insert into comments (post_id, author, body, created_at, parent_id) values
  (4, 'mbr_camilleaaaaaaaaaaaaaaaaaaa', 'Yes: a locked room in the courtyard, 20 spaces.', pg_temp.at(5, '11:40'), 1),
  (5, 'mbr_noraaaaaaaaaaaaaaaaaaaaaaa', 'Thank you all, what a warm welcome! Thursday it is.', pg_temp.at(2, '09:50'), 4);

-- Each person's last visit: what came since shows as new.
insert into visits (member, seen_at, marker_at) values
  ('mbr_hugoaaaaaaaaaaaaaaaaaaaaaa', now() - interval '5 minutes', pg_temp.at(4, '17:30')),
  ('mbr_inesaaaaaaaaaaaaaaaaaaaaaa', now() - interval '5 minutes', pg_temp.at(4, '17:30')),
  ('mbr_tomaaaaaaaaaaaaaaaaaaaaaaa', now() - interval '5 minutes', pg_temp.at(4, '17:30'));

-- Views, as the tool keeps them (lib/views.ts): per post, a key of its
-- own and one fingerprint per person who opened it — never who. Random
-- here: a sample. Six of six opened the first posts; the latest post
-- (two days old) was opened by 3, below the floor of 5: it shows "< 5".
update posts set view_key = md5(random()::text) || md5(random()::text) where id <= 6;
insert into post_views (post_id, fingerprint, hour)
  select p.id, md5(random()::text), date_trunc('hour', p.publish_at) + interval '1 hour'
  from posts p cross join generate_series(1, 6) n
  where p.id <= 6 and n <= case p.id when 6 then 3 when 5 then 5 else 6 end;

-- Posts from everyone (migrations/0006): Hugo's shout-out to Léa, which
-- Sofia approved; a piece of news Léa proposed, waiting for a publisher.
insert into posts (kind, title, body, locale, author, publish_at, created_at, announced_at, welcome, approved_by) values
  ('shoutout', 'Thank you, Léa!',
   E'Léa stayed late on Friday to finish the plans for the Villeurbanne site, so the client had them on Monday morning. Thank you!',
   'en', 'mbr_hugoaaaaaaaaaaaaaaaaaaaaaa', pg_temp.at(2, '12:10'), pg_temp.at(2, '11:40'), pg_temp.at(2, '12:10'), 'mbr_leaaaaaaaaaaaaaaaaaaaaaaaa', 'mbr_sofiaaaaaaaaaaaaaaaaaaaaaa');
insert into reactions (post_id, member, emoji, at)
  select id, 'mbr_inesaaaaaaaaaaaaaaaaaaaaaa', 'clap', pg_temp.at(2, '13:00') from posts where kind = 'shoutout';
insert into proposals (kind, title, body, locale, author, created_at) values
  ('info', 'Le chantier de Villeurbanne est livré',
   E'Les derniers luminaires sont posés depuis ce matin. Le client organise une visite jeudi : qui veut venir ?',
   'fr', 'mbr_leaaaaaaaaaaaaaaaaaaaaaaaa', now() - interval '3 hours');
