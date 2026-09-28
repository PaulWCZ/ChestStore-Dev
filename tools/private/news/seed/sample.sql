-- Sample data for local runs and screenshots (never run by the Chest): the
-- last month of a seven-person company. The member ids are those of the
-- studio's dev harness (lab/chest-dev/cast.mjs): Camille and Sofia publish,
-- the others read. Times are relative to now, so the page always looks
-- current.
insert into posts (kind, title, body, author, important, pinned_at, publish_at, created_at, announced_at, event_day, event_start, event_end, place, welcome) values
  ('announcement', 'Q3 is closed: thank you all',
   E'We closed the third quarter **12 % above plan**. Thank you, all of you, for a demanding summer.\n\nThe details are in the shared folder. We will talk about Q4 at the next team breakfast.',
   'mbr_camilleaaaaaaaaaaaaaaaaaaa', false, null, now() - interval '26 days', now() - interval '26 days', now() - interval '26 days', null, null, null, null, null),
  ('info', 'The Wi-Fi password changes on Monday',
   E'For security, the office Wi-Fi password changes every quarter. From Monday, look at the card by the coffee machine.\n\nGuests keep using the *Guest* network.',
   'mbr_sofiaaaaaaaaaaaaaaaaaaaaaa', false, null, now() - interval '19 days', now() - interval '19 days', now() - interval '19 days', null, null, null, null, null),
  ('event', 'Team dinner at Le Petit Zinc',
   E'Let''s celebrate the quarter together! Dinner is on the company.\n\n- Vegetarian menu available\n- Partners welcome, tell Sofia by Friday\n\nSay below if you are coming, so we can book the right table.',
   'mbr_sofiaaaaaaaaaaaaaaaaaaaaaa', false, null, now() - interval '10 days', now() - interval '10 days', now() - interval '10 days',
   current_date + 12, (current_date + 12 + time '19:30') at time zone 'Europe/Paris', (current_date + 12 + time '23:00') at time zone 'Europe/Paris', 'Le Petit Zinc, 11 rue Saint-Benoît, Paris 6e', null),
  ('announcement', 'We are moving on 2 November',
   E'After six years in rue du Faubourg, we move to **14 rue des Arts**, 3rd floor — twice the space, a real meeting room and a terrace.\n\n## What changes for you\n- Pack your desk on **Friday 30 October** (boxes arrive on Monday)\n- The office is closed on Monday 2 November: work from home\n- Your new badge is on your desk from Tuesday\n\nQuestions? Ask Camille or reply below.',
   'mbr_camilleaaaaaaaaaaaaaaaaaaa', true, now() - interval '6 days', now() - interval '6 days', now() - interval '6 days', now() - interval '6 days', null, null, null, null, null),
  ('welcome', 'Welcome to Nora, our new designer!',
   E'Nora joins us today as our **product designer**. She spent four years at a design studio in Lyon, and she draws the best maps you have ever seen.\n\nShe sits next to Léa. Come and say hello — and show her where the good coffee is.',
   'mbr_sofiaaaaaaaaaaaaaaaaaaaaaa', false, null, now() - interval '3 days', now() - interval '3 days', now() - interval '3 days', null, null, null, null, 'mbr_noraaaaaaaaaaaaaaaaaaaaaaa'),
  ('info', 'Expense claims: send them by the 25th',
   E'To be paid with your salary, send your expense claims **before the 25th** of the month, with the receipts.\n\nThe form is in the accounting folder: [expense claims guide](https://example.com/expenses).',
   'mbr_camilleaaaaaaaaaaaaaaaaaaa', false, null, now() - interval '2 days', now() - interval '2 days', now() - interval '2 days', null, null, null, null, null),
  ('announcement', 'Office closed for the holidays',
   E'The office closes from **24 December to 1 January**. Enjoy the break!',
   'mbr_camilleaaaaaaaaaaaaaaaaaaa', false, null, now() + interval '2 days', now() - interval '1 hour', null, null, null, null, null, null);

-- Posts in order: 1 Q3, 2 Wi-Fi, 3 dinner, 4 move, 5 welcome, 6 expenses, 7 holidays (scheduled).
insert into confirmations (post_id, member, at) values
  (4, 'mbr_hugoaaaaaaaaaaaaaaaaaaaaaa', now() - interval '6 days' + interval '40 minutes'),
  (4, 'mbr_leaaaaaaaaaaaaaaaaaaaaaaaa', now() - interval '5 days'),
  (4, 'mbr_sofiaaaaaaaaaaaaaaaaaaaaaa', now() - interval '5 days' + interval '3 hours');

insert into rsvps (post_id, member, answer, at) values
  (3, 'mbr_camilleaaaaaaaaaaaaaaaaaaa', 'yes', now() - interval '9 days'),
  (3, 'mbr_hugoaaaaaaaaaaaaaaaaaaaaaa', 'yes', now() - interval '9 days'),
  (3, 'mbr_leaaaaaaaaaaaaaaaaaaaaaaaa', 'yes', now() - interval '8 days'),
  (3, 'mbr_tomaaaaaaaaaaaaaaaaaaaaaaa', 'no', now() - interval '7 days'),
  (3, 'mbr_noraaaaaaaaaaaaaaaaaaaaaaa', 'yes', now() - interval '2 days');

insert into reactions (post_id, member, emoji, at) values
  (1, 'mbr_hugoaaaaaaaaaaaaaaaaaaaaaa', 'party', now() - interval '26 days'),
  (1, 'mbr_inesaaaaaaaaaaaaaaaaaaaaaa', 'clap', now() - interval '26 days'),
  (1, 'mbr_tomaaaaaaaaaaaaaaaaaaaaaaa', 'clap', now() - interval '25 days'),
  (3, 'mbr_leaaaaaaaaaaaaaaaaaaaaaaaa', 'heart', now() - interval '9 days'),
  (3, 'mbr_hugoaaaaaaaaaaaaaaaaaaaaaa', 'party', now() - interval '9 days'),
  (4, 'mbr_inesaaaaaaaaaaaaaaaaaaaaaa', 'thumbs', now() - interval '6 days'),
  (4, 'mbr_tomaaaaaaaaaaaaaaaaaaaaaaa', 'party', now() - interval '5 days'),
  (5, 'mbr_camilleaaaaaaaaaaaaaaaaaaa', 'heart', now() - interval '3 days'),
  (5, 'mbr_hugoaaaaaaaaaaaaaaaaaaaaaa', 'heart', now() - interval '3 days'),
  (5, 'mbr_leaaaaaaaaaaaaaaaaaaaaaaaa', 'party', now() - interval '3 days'),
  (5, 'mbr_inesaaaaaaaaaaaaaaaaaaaaaa', 'clap', now() - interval '3 days'),
  (5, 'mbr_tomaaaaaaaaaaaaaaaaaaaaaaa', 'smile', now() - interval '2 days'),
  (6, 'mbr_hugoaaaaaaaaaaaaaaaaaaaaaa', 'thumbs', now() - interval '1 day');

insert into comments (post_id, author, body, created_at) values
  (4, 'mbr_inesaaaaaaaaaaaaaaaaaaaaaa', 'Is there parking for bikes at the new place?', now() - interval '5 days'),
  (4, 'mbr_camilleaaaaaaaaaaaaaaaaaaa', 'Yes: a locked room in the courtyard, 20 spaces.', now() - interval '5 days' + interval '2 hours'),
  (5, 'mbr_leaaaaaaaaaaaaaaaaaaaaaaaa', 'Welcome Nora! Lunch on Thursday?', now() - interval '3 days' + interval '1 hour'),
  (5, 'mbr_hugoaaaaaaaaaaaaaaaaaaaaaa', 'Welcome aboard!', now() - interval '3 days' + interval '2 hours'),
  (5, 'mbr_noraaaaaaaaaaaaaaaaaaaaaaa', 'Thank you all, what a warm welcome!', now() - interval '2 days'),
  (3, 'mbr_tomaaaaaaaaaaaaaaaaaaaaaaa', 'I''m in Berlin that week, have a great evening!', now() - interval '7 days');

-- Each person's last visit: what came since shows as new.
insert into visits (member, seen_at, marker_at) values
  ('mbr_hugoaaaaaaaaaaaaaaaaaaaaaa', now() - interval '5 minutes', now() - interval '4 days'),
  ('mbr_inesaaaaaaaaaaaaaaaaaaaaaa', now() - interval '5 minutes', now() - interval '4 days'),
  ('mbr_tomaaaaaaaaaaaaaaaaaaaaaaa', now() - interval '5 minutes', now() - interval '4 days');
