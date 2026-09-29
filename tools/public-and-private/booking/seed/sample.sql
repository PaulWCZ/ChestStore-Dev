-- Sample data for local runs and screenshots (never run by the Chest). The
-- member ids are the dev harness's (lab/chest-dev/cast.mjs); times are
-- relative to today, in Paris. The booking of Marie Leroy opens at
-- /b/demoGuestLinkForTheScreens000000.
create function pg_temp.at(days integer, minutes integer) returns timestamptz language sql as $$
  select (date_trunc('day', now() at time zone 'Europe/Paris') + make_interval(days => days, mins => minutes)) at time zone 'Europe/Paris'
$$;

do $$
declare
  camille text := 'mbr_camilleaaaaaaaaaaaaaaaaaaa';
  ines text := 'mbr_inesaaaaaaaaaaaaaaaaaaaaaa';
  hugo text := 'mbr_hugoaaaaaaaaaaaaaaaaaaaaaa';
  week jsonb := '[[], [[540, 750], [840, 1080]], [[540, 750], [840, 1080]], [[540, 750], [840, 1080]], [[540, 750], [840, 1080]], [[540, 750], [840, 1020]], []]';
  showroom bigint; call bigint; phone bigint; visit bigint; founder bigint; discovery bigint; google bigint; outlook bigint;
begin
  insert into settings (key, value) values ('company_name', '"Atelier Martin"'), ('default_zone', '"Europe/Paris"');

  insert into hosts (member_id, slug, zone, weekly, welcome, created_at) values
    (ines, 'ines-moreau', 'Europe/Paris', week, 'I help you choose furniture that fits your home. Come to the showroom, or let''s talk by video.', now() - interval '60 days'),
    (hugo, 'hugo-bernard', 'Europe/Paris', '[[], [[480, 720]], [[480, 720], [780, 1020]], [], [[480, 720], [780, 1020]], [[480, 720]], [[540, 720]]]', 'I measure your space before we build. Book a visit at your home in Lyon and around.', now() - interval '50 days'),
    (camille, 'camille-martin', 'Europe/Paris', '[[], [], [[600, 720]], [], [[600, 720]], [], []]', '', now() - interval '40 days');

  insert into types (member_id, slug, title, description, duration, interval, location_kind, location, buffer_before, buffer_after, notice_minutes, window_days, color, position)
    values (ines, 'showroom', 'Showroom visit', 'Touch the fabrics, try the sofas, leave with a sketch and a price. Bring a photo and the size of your room.', 60, 30, 'place', '14 rue des Arts, 69002 Lyon', 0, 15, 1440, 45, 'sun', 0) returning id into showroom;
  insert into types (member_id, slug, title, description, duration, interval, location_kind, location, notice_minutes, color, position)
    values (ines, 'project-call', 'Project call', 'Tell me about your project: what, where, when, and your budget.', 30, 30, 'video', 'https://meet.jit.si/', 240, 'sky', 1) returning id into call;
  update types set video_rooms = true where id = call;
  insert into types (member_id, slug, title, duration, interval, location_kind, notice_minutes, color, position)
    values (ines, 'quick-call', 'Quick phone call', 15, 15, 'phone', 120, 'leaf', 2) returning id into phone;
  insert into types (member_id, slug, title, description, duration, interval, location_kind, location, buffer_before, buffer_after, notice_minutes, window_days, color, position)
    values (hugo, 'measurement', 'Measurement visit at your home', 'I come with a laser meter and samples. Allow an hour; someone of age must be there.', 60, 60, 'place', 'At your home (Lyon and around, 30 km)', 30, 30, 2880, 60, 'tomato', 0) returning id into visit;
  insert into types (member_id, slug, title, duration, interval, location_kind, location, notice_minutes, color, active, position)
    values (camille, 'founder', 'Meet the founder', 45, 45, 'video', 'https://meet.example.com/camille', 1440, 'grape', true, 0) returning id into founder;

  -- A paid visit (a deposit, taken off the order), and a team type: the
  -- first of Camille, Inès and Hugo who is free.
  update types set payment_link = 'https://buy.stripe.com/test_atelier_measure' where id = visit;
  insert into types (member_id, slug, title, description, duration, interval, location_kind, location, video_rooms, notice_minutes, color, position, pool)
    values (camille, 'discovery', 'Discovery call', 'Twenty minutes with one of us to see what we can make for you.', 20, 20, 'video', 'https://meet.jit.si/', true, 120, 'berry', 1, jsonb_build_array(ines, hugo)) returning id into discovery;

  -- The host's own questions, and a daily limit on the showroom visits.
  update types set questions = '[
      {"id": "project1", "label": "What is it for?", "kind": "choice", "required": true, "options": ["A home", "A shop or an office", "A hotel or a restaurant"]},
      {"id": "budget01", "label": "Your budget, roughly", "kind": "short", "required": false, "options": []},
      {"id": "plans001", "label": "Do you have plans or photos to share?", "kind": "yesno", "required": false, "options": []}
    ]'::jsonb where id = call;
  update types set daily_limit = 3, questions = '[
      {"id": "rooms001", "label": "Which rooms?", "kind": "long", "required": false, "options": []}
    ]'::jsonb where id = showroom;

  insert into overrides (member_id, day, ranges, note) values
    (ines, (now() at time zone 'Europe/Paris')::date + 9, '[]', 'Trade fair'),
    (ines, (now() at time zone 'Europe/Paris')::date + 10, '[]', 'Trade fair'),
    (hugo, (now() at time zone 'Europe/Paris')::date + 12, '[[540, 720]]', 'Saturday open day');

  insert into bookings (type_id, member_id, title, duration, location_kind, location, starts_at, ends_at, blocked, guest_name, guest_email, guest_phone, guest_note, guest_zone, guest_language, secret_hash, secret, created_at, moves)
  values
    (showroom, ines, 'Showroom visit', 60, 'place', '14 rue des Arts, 69002 Lyon', pg_temp.at(1, 600), pg_temp.at(1, 660), tstzrange(pg_temp.at(1, 600), pg_temp.at(1, 675)),
      'Marie Leroy', 'marie.leroy@example.com', '', 'We are moving into a 3-room flat in March and need a sofa and a dining table for six.', 'Europe/Paris', 'en', encode(sha256(convert_to('demoGuestLinkForTheScreens000000', 'UTF8')), 'hex'), 'demoGuestLinkForTheScreens000000', now() - interval '6 days', 0),
    (call, ines, 'Project call', 30, 'video', 'https://meet.example.com/atelier-ines', pg_temp.at(1, 870), pg_temp.at(1, 900), tstzrange(pg_temp.at(1, 870), pg_temp.at(1, 900)),
      'Sarah Klein', 'sarah.klein@lumiere-hotels.example', '', 'Lobby furniture for a 40-room hotel in Montreal.', 'America/Montreal', 'en', encode(sha256(convert_to(gen_random_uuid()::text, 'UTF8')), 'hex'), gen_random_uuid()::text, now() - interval '3 days', 1),
    (phone, ines, 'Quick phone call', 15, 'phone', '', pg_temp.at(0, 1020), pg_temp.at(0, 1035), tstzrange(pg_temp.at(0, 1020), pg_temp.at(0, 1035)),
      'Jean Dupont', 'jean.dupont@example.com', '+33 6 12 34 56 78', 'Question sur la livraison de ma lampe.', 'Europe/Paris', 'fr', encode(sha256(convert_to(gen_random_uuid()::text, 'UTF8')), 'hex'), gen_random_uuid()::text, now() - interval '1 day', 0),
    (showroom, ines, 'Showroom visit', 60, 'place', '14 rue des Arts, 69002 Lyon', pg_temp.at(3, 570), pg_temp.at(3, 630), tstzrange(pg_temp.at(3, 570), pg_temp.at(3, 645)),
      'Lucas Garnier', 'lucas.garnier@example.com', '', '', 'Europe/Paris', 'fr', encode(sha256(convert_to(gen_random_uuid()::text, 'UTF8')), 'hex'), gen_random_uuid()::text, now() - interval '2 days', 0),
    (visit, hugo, 'Measurement visit at your home', 60, 'place', 'At your home (Lyon and around, 30 km)', pg_temp.at(2, 540), pg_temp.at(2, 600), tstzrange(pg_temp.at(2, 510), pg_temp.at(2, 630)),
      'Paul Bernard', 'paul.b@example.com', '', 'Alcove of 2.40 m for a bookcase, 8 rue Vendôme, 3rd floor, code 4521B.', 'Europe/Paris', 'fr', encode(sha256(convert_to(gen_random_uuid()::text, 'UTF8')), 'hex'), gen_random_uuid()::text, now() - interval '8 days', 0),
    (founder, camille, 'Meet the founder', 45, 'video', 'https://meet.example.com/camille', pg_temp.at(4, 600), pg_temp.at(4, 645), tstzrange(pg_temp.at(4, 600), pg_temp.at(4, 645)),
      'Anna Schmidt', 'anna@designstudio.example', '', 'Partnership for our Berlin shop.', 'Europe/Berlin', 'en', encode(sha256(convert_to(gen_random_uuid()::text, 'UTF8')), 'hex'), gen_random_uuid()::text, now() - interval '5 days', 0),
    (call, ines, 'Project call', 30, 'video', 'https://meet.example.com/atelier-ines', pg_temp.at(-2, 600), pg_temp.at(-2, 630), tstzrange(pg_temp.at(-2, 600), pg_temp.at(-2, 630)),
      'Claire Morel', 'claire.morel@example.com', '', '', 'Europe/Paris', 'fr', encode(sha256(convert_to(gen_random_uuid()::text, 'UTF8')), 'hex'), gen_random_uuid()::text, now() - interval '9 days', 0),
    (showroom, ines, 'Showroom visit', 60, 'place', '14 rue des Arts, 69002 Lyon', pg_temp.at(-5, 900), pg_temp.at(-5, 960), tstzrange(pg_temp.at(-5, 900), pg_temp.at(-5, 975)),
      'Hélène Roux', 'helene.roux@example.com', '', 'Chaises de salle à manger.', 'Europe/Paris', 'fr', encode(sha256(convert_to(gen_random_uuid()::text, 'UTF8')), 'hex'), gen_random_uuid()::text, now() - interval '12 days', 0);

  insert into bookings (type_id, member_id, title, duration, location_kind, location, starts_at, ends_at, blocked, guest_name, guest_email, guest_note, guest_zone, guest_language, secret_hash, secret, status, cancelled_by, cancel_reason, cancelled_at, created_at)
  values (call, ines, 'Project call', 30, 'video', 'https://meet.example.com/atelier-ines', pg_temp.at(2, 600), pg_temp.at(2, 630), tstzrange(pg_temp.at(2, 600), pg_temp.at(2, 630)),
    'Tom Leclerc', 'tom.leclerc@example.com', '', 'Europe/Paris', 'fr', encode(sha256(convert_to(gen_random_uuid()::text, 'UTF8')), 'hex'), gen_random_uuid()::text, 'cancelled', 'guest', 'Finalement nous avons trouvé.', now() - interval '1 day', now() - interval '4 days');
  update bookings set location = 'https://meet.jit.si/', video_link = 'https://meet.jit.si/atelier-martin-' || substr(md5(guest_email), 1, 12) where type_id = call;
  update bookings set payment_link = 'https://buy.stripe.com/test_atelier_measure', paid = true where type_id = visit;

  -- Times Inès blocked, and her Google calendar (read four minutes ago:
  -- only when she is busy, never what); Hugo's Outlook calendar stopped
  -- answering this morning.
  insert into blocks (member_id, span, note) values
    (ines, tstzrange(pg_temp.at(2, 540), pg_temp.at(2, 600)), 'Team meeting'),
    (ines, tstzrange(pg_temp.at(4, 600), pg_temp.at(4, 690)), 'Supplier visit');
  insert into calendars (member_id, url, provider, added_at, tried_at, read_at, events)
    values (ines, 'https://calendar.google.com/calendar/ical/ines%40atelier-martin.test/private-5f1c0d8e7a6b4c3d2e1f/basic.ics', 'calendar.google.com', now() - interval '20 days', now() - interval '4 minutes', now() - interval '4 minutes', 38) returning id into google;
  insert into busy (calendar_id, member_id, span) values
    (google, ines, tstzrange(pg_temp.at(1, 960), pg_temp.at(1, 1020))),
    (google, ines, tstzrange(pg_temp.at(2, 660), pg_temp.at(2, 750))),
    (google, ines, tstzrange(pg_temp.at(3, 840), pg_temp.at(3, 930))),
    (google, ines, tstzrange(pg_temp.at(8, 0), pg_temp.at(9, 0)));
  insert into calendars (member_id, url, provider, added_at, tried_at, read_at, error, events)
    values (hugo, 'https://outlook.office365.com/owa/calendar/0f3a9c/b7d2e4/calendar.ics', 'outlook.office365.com', now() - interval '30 days', now() - interval '5 minutes', now() - interval '3 hours', 'refused', 12) returning id into outlook;
  insert into busy (calendar_id, member_id, span) values
    (outlook, hugo, tstzrange(pg_temp.at(1, 480), pg_temp.at(1, 600)));

  -- Every host's page is public (they confirmed their hours), and their
  -- texts are written in English with a French version: a visitor reads
  -- the whole page in their language (lib/texts.ts).
  update hosts set ready = true, language = 'en', second_language = 'fr';
  update hosts set welcome_alt = 'Je vous aide à choisir des meubles faits pour votre intérieur. Venez au showroom, ou parlons-en en visio.' where member_id = ines;
  update hosts set welcome_alt = 'Je mesure votre espace avant de fabriquer. Réservez une visite chez vous, à Lyon et alentour.' where member_id = hugo;
  update types set alt = jsonb_build_object('title', 'Visite du showroom', 'description', 'Touchez les tissus, essayez les canapés, repartez avec un croquis et un prix. Apportez une photo et les dimensions de votre pièce.', 'rooms001', 'Quelles pièces ?') where id = showroom;
  update types set alt = jsonb_build_object('title', 'Appel projet', 'description', 'Parlez-moi de votre projet : quoi, où, quand, et votre budget.',
      'project1', 'À quoi est-ce destiné ?', 'project1.0', 'Un logement', 'project1.1', 'Une boutique ou un bureau', 'project1.2', 'Un hôtel ou un restaurant',
      'budget01', 'Votre budget, à peu près', 'plans001', 'Avez-vous des plans ou des photos à partager ?') where id = call;
  update types set alt = jsonb_build_object('title', 'Appel rapide') where id = phone;
  update types set alt = jsonb_build_object('title', 'Visite de mesure à domicile', 'description', 'Je viens avec un télémètre laser et des échantillons. Comptez une heure ; une personne majeure doit être présente.') where id = visit;
  update types set alt = jsonb_build_object('title', 'Un échange avec la direction') where id = founder;
  update types set alt = jsonb_build_object('title', 'Appel découverte', 'description', 'Vingt minutes avec l’un de nous pour voir ce que nous pouvons fabriquer pour vous.') where id = discovery;
  -- A booking keeps the type's name as its guest read it.
  update bookings b set title = t.alt->>'title' from types t where b.type_id = t.id and b.guest_language = 'fr' and t.alt ? 'title';

  update bookings set answers = '[
      {"id": "project1", "label": "What is it for?", "kind": "choice", "answer": "A hotel or a restaurant"},
      {"id": "budget01", "label": "Your budget, roughly", "kind": "short", "answer": "80 000 € for the lobby"},
      {"id": "plans001", "label": "Do you have plans or photos to share?", "kind": "yesno", "answer": "yes"}
    ]'::jsonb where guest_email = 'sarah.klein@lumiere-hotels.example';
  update bookings set answers = '[
      {"id": "rooms001", "label": "Which rooms?", "kind": "long", "answer": "Living room (5 × 4 m) and the dining room."}
    ]'::jsonb where guest_email = 'marie.leroy@example.com';
end $$;
