-- Sample data for local runs and screenshots (never run by the Chest):
-- Atelier Martin, a furniture workshop of about 30 people. Dates are
-- relative to the day the file is loaded: the current cycle "Q4 2026" is
-- in its sixth week, "Q3 2026" before it is closed with its scores and
-- what the team learned. Member ids are those of the studio's harness
-- (lab/chest-dev/cast.mjs); Paul Lefèvre has left the company.

insert into cycles (id, name, starts_on, ends_on, current, closed_at, closed_by, created_by, created_at) overriding system value values
  (1, 'Q3 2026', current_date - 129, current_date - 39, false, now() - interval '36 days', 'mbr_camilleaaaaaaaaaaaaaaaaaaa', 'mbr_camilleaaaaaaaaaaaaaaaaaaa', now() - interval '140 days'),
  (2, 'Q4 2026', current_date - 38, current_date + 52, true, null, null, 'mbr_camilleaaaaaaaaaaaaaaaaaaa', now() - interval '45 days');
select setval(pg_get_serial_sequence('cycles', 'id'), 2);

insert into teams (id, name, group_id) overriding system value values
  (1, 'Sales', 'grp_salesaaaaaaaaaaaaaaaaaaaaa'),
  (2, 'Workshop', null),
  (3, 'Office', 'grp_officeaaaaaaaaaaaaaaaaaaaa');
select setval(pg_get_serial_sequence('teams', 'id'), 3);

insert into objectives (id, cycle_id, level, team_id, parent_id, owner, title, why, position, score, learned, retro_by, retro_at, created_by, created_at) overriding system value values
  (1, 1, 'company', null, null, 'mbr_camilleaaaaaaaaaaaaaaaaaaa', 'Launch the new catalogue', 'Shops asked for a printed catalogue; it is how they order from us.', 1, 0.8, 'Printing took three weeks longer than planned. Next time: order the proofs in the first week.', 'mbr_camilleaaaaaaaaaaaaaaaaaaa', now() - interval '37 days', 'mbr_camilleaaaaaaaaaaaaaaaaaaa', now() - interval '138 days'),
  (2, 1, 'company', null, null, 'mbr_tomaaaaaaaaaaaaaaaaaaaaaaa', 'Hire two workshop technicians', 'The order book is full until spring; we cannot grow without hands.', 2, 0.5, 'One great hire. The second post stayed open: our job ad was too vague about the tools we use.', 'mbr_tomaaaaaaaaaaaaaaaaaaaaaaa', now() - interval '37 days', 'mbr_camilleaaaaaaaaaaaaaaaaaaa', now() - interval '138 days'),
  (3, 1, 'team', 1, 1, 'mbr_inesaaaaaaaaaaaaaaaaaaaaaa', 'Win back 10 lapsed customers', 'Old customers know us: the cheapest sales we can make.', 1, 0.6, 'Phone calls worked, emails did not. Keep the Friday call hour.', 'mbr_inesaaaaaaaaaaaaaaaaaaaaaa', now() - interval '37 days', 'mbr_camilleaaaaaaaaaaaaaaaaaaa', now() - interval '138 days'),
  (4, 2, 'company', null, null, 'mbr_camilleaaaaaaaaaaaaaaaaaaa', 'Win 20 new customers in Lyon', 'Lyon is our second market. Twenty new customers pay for the new cutting machine and keep the workshop busy all winter.', 1, null, '', null, null, 'mbr_camilleaaaaaaaaaaaaaaaaaaa', now() - interval '40 days'),
  (5, 2, 'company', null, null, 'mbr_tomaaaaaaaaaaaaaaaaaaaaaaa', 'Deliver every order on time', 'Late deliveries cost us two good customers last quarter. Being on time is what shops remember.', 2, null, '', null, null, 'mbr_camilleaaaaaaaaaaaaaaaaaaa', now() - interval '40 days'),
  (6, 2, 'company', null, null, 'mbr_sofiaaaaaaaaaaaaaaaaaaaaaa', 'Halve the time we spend on paperwork', 'Every hour on invoices is an hour not spent with customers.', 3, null, '', null, null, 'mbr_camilleaaaaaaaaaaaaaaaaaaa', now() - interval '40 days'),
  (7, 2, 'team', 1, 4, 'mbr_inesaaaaaaaaaaaaaaaaaaaaaa', 'Open 12 shops in Lyon and Grenoble', 'Shops sell our furniture every day, without us.', 1, null, '', null, null, 'mbr_camilleaaaaaaaaaaaaaaaaaaa', now() - interval '40 days'),
  (8, 2, 'team', 1, null, 'mbr_hugoaaaaaaaaaaaaaaaaaaaaaa', 'Keep every customer we have', 'Winning a customer back costs five times more than keeping one.', 2, null, '', null, null, 'mbr_camilleaaaaaaaaaaaaaaaaaaa', now() - interval '40 days'),
  (9, 2, 'team', 2, 5, 'mbr_tomaaaaaaaaaaaaaaaaaaaaaaa', 'Ship orders within 5 days', '', 1, null, '', null, null, 'mbr_camilleaaaaaaaaaaaaaaaaaaa', now() - interval '40 days'),
  (10, 2, 'team', 3, 6, 'mbr_sofiaaaaaaaaaaaaaaaaaaaaaa', 'Pay every supplier on time', 'Our suppliers give us their best prices because we pay on time.', 1, null, '', null, null, 'mbr_camilleaaaaaaaaaaaaaaaaaaa', now() - interval '40 days');
select setval(pg_get_serial_sequence('objectives', 'id'), 10);

insert into key_results (id, objective_id, title, kind, unit, currency, start_value, target_value, current_value, weight, owner, position, created_by, created_at) overriding system value values
  (1, 1, 'Catalogue printed and sent', 'milestone', '', null, 0, 1, 1, 1, 'mbr_camilleaaaaaaaaaaaaaaaaaaa', 1, 'mbr_camilleaaaaaaaaaaaaaaaaaaa', now() - interval '138 days'),
  (2, 1, 'Shops that received it', 'number', 'shops', null, 0, 40, 34, 1, 'mbr_inesaaaaaaaaaaaaaaaaaaaaaa', 2, 'mbr_camilleaaaaaaaaaaaaaaaaaaa', now() - interval '138 days'),
  (3, 2, 'Technicians hired', 'number', 'people', null, 0, 2, 1, 1, 'mbr_tomaaaaaaaaaaaaaaaaaaaaaaa', 1, 'mbr_camilleaaaaaaaaaaaaaaaaaaa', now() - interval '138 days'),
  (4, 3, 'Lapsed customers ordering again', 'number', 'customers', null, 0, 10, 6, 1, 'mbr_inesaaaaaaaaaaaaaaaaaaaaaa', 1, 'mbr_camilleaaaaaaaaaaaaaaaaaaa', now() - interval '138 days'),
  (5, 4, 'New customers signed', 'number', 'customers', null, 0, 20, 9, 2, 'mbr_inesaaaaaaaaaaaaaaaaaaaaaa', 1, 'mbr_camilleaaaaaaaaaaaaaaaaaaa', now() - interval '38 days'),
  (6, 4, 'Quotes sent', 'number', 'quotes', null, 0, 60, 33, 1, 'mbr_hugoaaaaaaaaaaaaaaaaaaaaaa', 2, 'mbr_camilleaaaaaaaaaaaaaaaaaaa', now() - interval '38 days'),
  (7, 4, 'Revenue from new customers', 'money', '', 'EUR', 0, 50000, 18000, 1, 'mbr_camilleaaaaaaaaaaaaaaaaaaa', 3, 'mbr_camilleaaaaaaaaaaaaaaaaaaa', now() - interval '38 days'),
  (8, 5, 'Orders delivered on time', 'percent', '', null, 82, 98, 90, 2, 'mbr_tomaaaaaaaaaaaaaaaaaaaaaaa', 1, 'mbr_camilleaaaaaaaaaaaaaaaaaaa', now() - interval '38 days'),
  (9, 5, 'Customer returns', 'percent', '', null, 6, 2, 5, 1, 'mbr_paulaaaaaaaaaaaaaaaaaaaaaa', 2, 'mbr_camilleaaaaaaaaaaaaaaaaaaa', now() - interval '38 days'),
  (10, 5, 'New cutting machine running', 'milestone', '', null, 0, 1, 0, 1, 'mbr_leaaaaaaaaaaaaaaaaaaaaaaaa', 3, 'mbr_camilleaaaaaaaaaaaaaaaaaaa', now() - interval '38 days'),
  (11, 6, 'Hours a week on invoicing', 'number', 'hours', null, 12, 6, 8.5, 1, 'mbr_sofiaaaaaaaaaaaaaaaaaaaaaa', 1, 'mbr_camilleaaaaaaaaaaaaaaaaaaa', now() - interval '38 days'),
  (12, 6, 'Leave requests handled in the Chest', 'milestone', '', null, 0, 1, 1, 1, 'mbr_camilleaaaaaaaaaaaaaaaaaaa', 2, 'mbr_camilleaaaaaaaaaaaaaaaaaaa', now() - interval '38 days'),
  (13, 7, 'Shops signed', 'number', 'shops', null, 0, 12, 5, 2, 'mbr_hugoaaaaaaaaaaaaaaaaaaaaaa', 1, 'mbr_camilleaaaaaaaaaaaaaaaaaaa', now() - interval '38 days'),
  (14, 7, 'Demo days held', 'number', 'days', null, 0, 6, 3, 1, 'mbr_inesaaaaaaaaaaaaaaaaaaaaaa', 2, 'mbr_camilleaaaaaaaaaaaaaaaaaaa', now() - interval '38 days'),
  (15, 8, 'Customers lost', 'number', 'customers', null, 3, 0, 1, 1, 'mbr_hugoaaaaaaaaaaaaaaaaaaaaaa', 1, 'mbr_camilleaaaaaaaaaaaaaaaaaaa', now() - interval '38 days'),
  (16, 9, 'Average days to ship', 'number', 'days', null, 8, 5, 6.2, 1, 'mbr_tomaaaaaaaaaaaaaaaaaaaaaaa', 1, 'mbr_camilleaaaaaaaaaaaaaaaaaaa', now() - interval '38 days'),
  (17, 9, 'Second shift trained', 'milestone', '', null, 0, 1, 0, 1, 'mbr_leaaaaaaaaaaaaaaaaaaaaaaaa', 2, 'mbr_camilleaaaaaaaaaaaaaaaaaaa', now() - interval '38 days'),
  (18, 10, 'Invoices paid late (a month)', 'number', 'invoices', null, 14, 2, 6, 1, 'mbr_sofiaaaaaaaaaaaaaaaaaaaaaa', 1, 'mbr_camilleaaaaaaaaaaaaaaaaaaa', now() - interval '38 days');
select setval(pg_get_serial_sequence('key_results', 'id'), 18);

insert into check_ins (key_result_id, value, confidence, note, author, created_at) values
  (1, 0, 'on_track', '', 'mbr_camilleaaaaaaaaaaaaaaaaaaa', now() - interval '2400 hours'),
  (1, 0, 'at_risk', '', 'mbr_camilleaaaaaaaaaaaaaaaaaaa', now() - interval '1800 hours'),
  (1, 1, 'on_track', '', 'mbr_camilleaaaaaaaaaaaaaaaaaaa', now() - interval '1200 hours'),
  (2, 5, 'on_track', '', 'mbr_inesaaaaaaaaaaaaaaaaaaaaaa', now() - interval '2640 hours'),
  (2, 14, 'on_track', '', 'mbr_inesaaaaaaaaaaaaaaaaaaaaaa', now() - interval '2256 hours'),
  (2, 22, 'at_risk', '', 'mbr_inesaaaaaaaaaaaaaaaaaaaaaa', now() - interval '1872 hours'),
  (2, 29, 'at_risk', '', 'mbr_inesaaaaaaaaaaaaaaaaaaaaaa', now() - interval '1488 hours'),
  (2, 34, 'at_risk', '', 'mbr_inesaaaaaaaaaaaaaaaaaaaaaa', now() - interval '1104 hours'),
  (3, 0, 'on_track', '', 'mbr_tomaaaaaaaaaaaaaaaaaaaaaaa', now() - interval '2520 hours'),
  (3, 1, 'at_risk', '', 'mbr_tomaaaaaaaaaaaaaaaaaaaaaaa', now() - interval '1920 hours'),
  (3, 1, 'off_track', '', 'mbr_tomaaaaaaaaaaaaaaaaaaaaaaa', now() - interval '1320 hours'),
  (4, 1, 'on_track', '', 'mbr_inesaaaaaaaaaaaaaaaaaaaaaa', now() - interval '2592 hours'),
  (4, 3, 'on_track', '', 'mbr_inesaaaaaaaaaaaaaaaaaaaaaa', now() - interval '2112 hours'),
  (4, 4, 'at_risk', '', 'mbr_inesaaaaaaaaaaaaaaaaaaaaaa', now() - interval '1632 hours'),
  (4, 6, 'at_risk', '', 'mbr_inesaaaaaaaaaaaaaaaaaaaaaa', now() - interval '1152 hours'),
  (5, 2, 'on_track', 'First two in Lyon: Maison Rivière and Atelier Bois.', 'mbr_inesaaaaaaaaaaaaaaaaaaaaaa', now() - interval '768 hours'),
  (5, 4, 'on_track', '', 'mbr_inesaaaaaaaaaaaaaaaaaaaaaa', now() - interval '600 hours'),
  (5, 5, 'at_risk', 'Slow week, two quotes lost on price.', 'mbr_inesaaaaaaaaaaaaaaaaaaaaaa', now() - interval '432 hours'),
  (5, 7, 'on_track', '', 'mbr_inesaaaaaaaaaaaaaaaaaaaaaa', now() - interval '264 hours'),
  (5, 9, 'on_track', 'The trade show brought eleven good leads.', 'mbr_inesaaaaaaaaaaaaaaaaaaaaaa', now() - interval '96 hours'),
  (6, 8, 'on_track', '', 'mbr_hugoaaaaaaaaaaaaaaaaaaaaaa', now() - interval '744 hours'),
  (6, 15, 'on_track', '', 'mbr_hugoaaaaaaaaaaaaaaaaaaaaaa', now() - interval '576 hours'),
  (6, 22, 'on_track', '', 'mbr_hugoaaaaaaaaaaaaaaaaaaaaaa', now() - interval '408 hours'),
  (6, 27, 'at_risk', 'Two days off sick.', 'mbr_hugoaaaaaaaaaaaaaaaaaaaaaa', now() - interval '240 hours'),
  (6, 33, 'on_track', 'Back on pace after the show.', 'mbr_hugoaaaaaaaaaaaaaaaaaaaaaa', now() - interval '2 hours'),
  (7, 3000, 'on_track', '', 'mbr_camilleaaaaaaaaaaaaaaaaaaa', now() - interval '720 hours'),
  (7, 7500, 'on_track', '', 'mbr_camilleaaaaaaaaaaaaaaaaaaa', now() - interval '552 hours'),
  (7, 12500, 'on_track', '', 'mbr_camilleaaaaaaaaaaaaaaaaaaa', now() - interval '384 hours'),
  (7, 18000, 'at_risk', 'Smaller first orders than we hoped.', 'mbr_camilleaaaaaaaaaaaaaaaaaaa', now() - interval '120 hours'),
  (8, 84, 'at_risk', '', 'mbr_tomaaaaaaaaaaaaaaaaaaaaaaa', now() - interval '792 hours'),
  (8, 86, 'at_risk', '', 'mbr_tomaaaaaaaaaaaaaaaaaaaaaaa', now() - interval '624 hours'),
  (8, 85, 'off_track', 'The old saw broke down for three days.', 'mbr_tomaaaaaaaaaaaaaaaaaaaaaaa', now() - interval '456 hours'),
  (8, 89, 'at_risk', '', 'mbr_tomaaaaaaaaaaaaaaaaaaaaaaa', now() - interval '288 hours'),
  (8, 90, 'at_risk', 'Better, but the machine is still not in.', 'mbr_tomaaaaaaaaaaaaaaaaaaaaaaa', now() - interval '120 hours'),
  (9, 5.5, 'on_track', 'New packaging for the chairs.', 'mbr_paulaaaaaaaaaaaaaaaaaaaaaa', now() - interval '720 hours'),
  (9, 5, 'at_risk', '', 'mbr_paulaaaaaaaaaaaaaaaaaaaaaa', now() - interval '504 hours'),
  (10, 0, 'on_track', 'Ordered.', 'mbr_leaaaaaaaaaaaaaaaaaaaaaaaa', now() - interval '696 hours'),
  (10, 0, 'at_risk', 'Delivery pushed back two weeks by the maker.', 'mbr_leaaaaaaaaaaaaaaaaaaaaaaaa', now() - interval '360 hours'),
  (10, 0, 'at_risk', 'Arrives on the 14th; the electrician is booked.', 'mbr_leaaaaaaaaaaaaaaaaaaaaaaaa', now() - interval '28 hours'),
  (11, 11, 'on_track', '', 'mbr_sofiaaaaaaaaaaaaaaaaaaaaaa', now() - interval '744 hours'),
  (11, 10, 'on_track', '', 'mbr_sofiaaaaaaaaaaaaaaaaaaaaaa', now() - interval '576 hours'),
  (11, 9, 'on_track', 'Invoices now leave from the Chest.', 'mbr_sofiaaaaaaaaaaaaaaaaaaaaaa', now() - interval '408 hours'),
  (11, 8.5, 'on_track', '', 'mbr_sofiaaaaaaaaaaaaaaaaaaaaaa', now() - interval '4 hours'),
  (12, 1, 'on_track', 'Everyone asks for leave in the Chest now.', 'mbr_camilleaaaaaaaaaaaaaaaaaaa', now() - interval '480 hours'),
  (13, 1, 'on_track', '', 'mbr_hugoaaaaaaaaaaaaaaaaaaaaaa', now() - interval '768 hours'),
  (13, 3, 'on_track', '', 'mbr_hugoaaaaaaaaaaaaaaaaaaaaaa', now() - interval '600 hours'),
  (13, 4, 'at_risk', '', 'mbr_hugoaaaaaaaaaaaaaaaaaaaaaa', now() - interval '432 hours'),
  (13, 4, 'off_track', 'Grenoble shops want exclusivity; we said no.', 'mbr_hugoaaaaaaaaaaaaaaaaaaaaaa', now() - interval '264 hours'),
  (13, 5, 'at_risk', 'One more in Lyon.', 'mbr_hugoaaaaaaaaaaaaaaaaaaaaaa', now() - interval '96 hours'),
  (14, 1, 'on_track', '', 'mbr_inesaaaaaaaaaaaaaaaaaaaaaa', now() - interval '672 hours'),
  (14, 2, 'on_track', '', 'mbr_inesaaaaaaaaaaaaaaaaaaaaaa', now() - interval '336 hours'),
  (14, 3, 'on_track', '', 'mbr_inesaaaaaaaaaaaaaaaaaaaaaa', now() - interval '144 hours'),
  (15, 2, 'at_risk', 'Two shops closing for good.', 'mbr_hugoaaaaaaaaaaaaaaaaaaaaaa', now() - interval '720 hours'),
  (15, 2, 'at_risk', '', 'mbr_hugoaaaaaaaaaaaaaaaaaaaaaa', now() - interval '384 hours'),
  (15, 1, 'on_track', 'Brun & Fils stay with us.', 'mbr_hugoaaaaaaaaaaaaaaaaaaaaaa', now() - interval '144 hours'),
  (16, 7.5, 'on_track', '', 'mbr_tomaaaaaaaaaaaaaaaaaaaaaaa', now() - interval '792 hours'),
  (16, 7, 'on_track', '', 'mbr_tomaaaaaaaaaaaaaaaaaaaaaaa', now() - interval '624 hours'),
  (16, 6.5, 'on_track', '', 'mbr_tomaaaaaaaaaaaaaaaaaaaaaaa', now() - interval '456 hours'),
  (16, 6.2, 'at_risk', '', 'mbr_tomaaaaaaaaaaaaaaaaaaaaaaa', now() - interval '120 hours'),
  (17, 0, 'on_track', '', 'mbr_leaaaaaaaaaaaaaaaaaaaaaaaa', now() - interval '648 hours'),
  (17, 0, 'on_track', 'Four of six trained.', 'mbr_leaaaaaaaaaaaaaaaaaaaaaaaa', now() - interval '312 hours'),
  (18, 12, 'on_track', '', 'mbr_sofiaaaaaaaaaaaaaaaaaaaaaa', now() - interval '744 hours'),
  (18, 9, 'on_track', '', 'mbr_sofiaaaaaaaaaaaaaaaaaaaaaa', now() - interval '576 hours'),
  (18, 7, 'on_track', '', 'mbr_sofiaaaaaaaaaaaaaaaaaaaaaa', now() - interval '408 hours'),
  (18, 6, 'on_track', '', 'mbr_sofiaaaaaaaaaaaaaaaaaaaaaa', now() - interval '72 hours');

insert into comments (objective_id, author, body, created_at) values
  (4, 'mbr_hugoaaaaaaaaaaaaaaaaaaaaaa', 'The Lyon trade show brought eleven good leads. I will send quotes to all of them this week.', now() - interval '4 days'),
  (4, 'mbr_camilleaaaaaaaaaaaaaaaaaaa', 'Great work. Inès, can you take the three restaurants? They want to see the showroom first.', now() - interval '3 days'),
  (4, 'mbr_inesaaaaaaaaaaaaaaaaaaaaaa', 'Oui, je les reçois jeudi à l’atelier.', now() - interval '3 days' + interval '2 hours'),
  (5, 'mbr_leaaaaaaaaaaaaaaaaaaaaaaaa', 'The new machine arrives on the 14th. Until then we run two shifts on the old saw.', now() - interval '1 day'),
  (1, 'mbr_tomaaaaaaaaaaaaaaaaaaaaaaa', 'The shops loved the new catalogue. Let us print it earlier next year.', now() - interval '38 days');

-- Paul Lefèvre left the company: what he owned waits for a new owner.
insert into departed (member_id, at) values ('mbr_paulaaaaaaaaaaaaaaaaaaaaaa', now() - interval '9 days');
