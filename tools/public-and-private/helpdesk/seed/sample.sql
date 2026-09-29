-- Sample data for local runs and screenshots (never run by the Chest). The
-- member ids are the dev harness's (lab/chest-dev/cast.mjs). Ticket 1003's
-- follow-up link is /t/demoFollowUpLinkForTheScreens000, ticket 1001's
-- /t/demoLampFollowUpLinkForScreens00.
do $$
declare
  camille text := 'mbr_camilleaaaaaaaaaaaaaaaaaaa';
  ines text := 'mbr_inesaaaaaaaaaaaaaaaaaaaaaa';
  hugo text := 'mbr_hugoaaaaaaaaaaaaaaaaaaaaaa';
  t bigint;
  damaged bigint;
  delivery bigint;
  invoice bigint;
begin
  insert into tags (name) values ('@damaged') returning id into damaged;
  insert into tags (name) values ('@delivery') returning id into delivery;
  insert into tags (name) values ('@invoice') returning id into invoice;
  insert into tags (name) values ('@orderChange');

  insert into settings (key, value) values ('company_name', '"Atelier Martin"'),
    ('intros', '{"en": "Questions about an order, a delivery or an invoice? Write to us: we answer within one working day.", "fr": "Une question sur une commande, une livraison ou une facture ? Écrivez-nous : nous répondons sous un jour ouvré."}'),
    ('hours', '{"on": true, "days": [{"start": 540, "end": 1080}, {"start": 540, "end": 1080}, {"start": 540, "end": 1080}, {"start": 540, "end": 1080}, {"start": 540, "end": 1020}, null, null], "holidays": ["2026-11-01", "2026-11-11", "2026-12-25"]}');

  insert into tickets (number, subject, status, customer_email, customer_name, channel, secret_hash, language, created_at, updated_at, priority, waiting_since)
  values (nextval('ticket_numbers'), 'My lamp arrived broken', 'open', 'jean.dupont@example.com', 'Jean Dupont', 'form', encode(sha256(convert_to('demoLampFollowUpLinkForScreens00', 'UTF8')), 'hex'), 'fr', now() - interval '3 hours', now() - interval '3 hours', 'high', now() - interval '3 hours') returning id into t;
  insert into ticket_tags (ticket_id, tag_id) values (t, damaged);
  insert into messages (ticket_id, kind, body, created_at) values (t, 'customer', 'Bonjour, la lampe Arco que j''ai reçue hier a le pied fêlé. Je joins une photo. Pouvez-vous l''échanger ? Merci, Jean', now() - interval '3 hours');

  insert into tickets (number, subject, status, customer_email, customer_name, channel, secret_hash, language, created_at, updated_at, waiting_since)
  values (nextval('ticket_numbers'), 'Invoice for order 4471', 'open', 'accounts@lumiere-hotels.example', 'Sarah Klein', 'email', encode(sha256(convert_to(gen_random_uuid()::text, 'UTF8')), 'hex'), 'en', now() - interval '6 days', now() - interval '6 days', now() - interval '6 days') returning id into t;
  insert into ticket_tags (ticket_id, tag_id) values (t, invoice);
  insert into messages (ticket_id, kind, body, created_at, email_id, mail_from, html) values (t, 'customer', E'Hello,\n\nCould you send the invoice for order 4471 with our VAT number FR12 345678901? Our accounts portal is https://pay.lumiere-hotels.example/suppliers.\n\nThank you.\nSarah Klein, Lumière Hotels\n\nOn Mon, 21 Sep 2026 at 10:02, Atelier Martin <support@atelier-martin.test> wrote:\n> Your order 4471 has shipped.\n> Camille', now() - interval '6 days', '<a1@lumiere-hotels.example>', 'accounts@lumiere-hotels.example',
    '<p>Hello,</p><p>Could you send the invoice for order <b>4471</b> with our VAT number <b>FR12 345678901</b>? Our accounts portal is <a href="https://pay.lumiere-hotels.example/suppliers" rel="noopener noreferrer nofollow">pay.lumiere-hotels.example</a>.</p><p>Thank you.<br>Sarah Klein, Lumière Hotels</p><blockquote><p>Your order 4471 has shipped.<br>Camille</p></blockquote>');

  insert into tickets (number, subject, status, customer_email, customer_name, channel, secret_hash, language, assignee, created_at, updated_at)
  values (nextval('ticket_numbers'), 'When will my table be delivered?', 'waiting', 'marie.leroy@example.com', 'Marie Leroy', 'form', encode(sha256(convert_to('demoFollowUpLinkForTheScreens000', 'UTF8')), 'hex'), 'en', ines, now() - interval '2 days', now() - interval '20 hours') returning id into t;
  insert into ticket_tags (ticket_id, tag_id) values (t, delivery);
  insert into messages (ticket_id, kind, body, created_at) values (t, 'customer', 'Hi, I ordered the oak dining table on the 12th. The confirmation said 3 weeks. Is it still on time? Marie', now() - interval '2 days');
  insert into messages (ticket_id, kind, author, body, created_at) values (t, 'note', ines, 'Workshop says varnish is drying, ships Thursday.', now() - interval '21 hours');
  insert into messages (ticket_id, kind, author, body, created_at, delivery) values (t, 'reply', ines, 'Hello Marie, good news: your table leaves our workshop on Thursday and the carrier will call you to agree on a time. Inès', now() - interval '20 hours', 'page');

  insert into tickets (number, subject, status, customer_email, customer_name, channel, secret_hash, language, assignee, created_at, updated_at, priority, waiting_since)
  values (nextval('ticket_numbers'), 'Can I change the fabric of my sofa?', 'open', 'paul.b@example.com', 'Paul Bernard', 'team', encode(sha256(convert_to(gen_random_uuid()::text, 'UTF8')), 'hex'), 'fr', hugo, now() - interval '5 hours', now() - interval '5 hours', 'low', now() - interval '5 hours') returning id into t;
  insert into ticket_tags (ticket_id, tag_id) select t, id from tags where name = '@orderChange';
  insert into messages (ticket_id, kind, author, body, created_at) values (t, 'customer', hugo, 'Appel de M. Bernard : il voudrait passer du velours vert au lin naturel sur la commande 4502. À vérifier avec l''atelier.', now() - interval '5 hours');

  insert into tickets (number, subject, status, customer_email, customer_name, channel, secret_hash, language, assignee, created_at, updated_at, closed_at)
  values (nextval('ticket_numbers'), 'Opening hours in December', 'closed', 'claire@example.com', 'Claire', 'form', encode(sha256(convert_to(gen_random_uuid()::text, 'UTF8')), 'hex'), 'en', camille, now() - interval '9 days', now() - interval '8 days', now() - interval '8 days') returning id into t;
  insert into messages (ticket_id, kind, body, created_at) values (t, 'customer', 'Are you open between Christmas and New Year?', now() - interval '9 days');
  insert into messages (ticket_id, kind, author, body, created_at, delivery) values (t, 'reply', camille, 'Hello Claire, the showroom is open on the 27th, 28th and 30th, 10:00–18:00. Camille', now() - interval '8 days', 'email');
  update tickets set rating = 'good', rated_at = now() - interval '7 days' where id = t;

  insert into tickets (number, subject, status, customer_email, customer_name, channel, secret_hash, language, created_at, updated_at, priority, waiting_since)
  values (nextval('ticket_numbers'), 'Wrong address on today''s delivery', 'open', 'n.faure@example.com', 'Nicolas Faure', 'email', encode(sha256(convert_to(gen_random_uuid()::text, 'UTF8')), 'hex'), 'fr', now() - interval '40 minutes', now() - interval '40 minutes', 'urgent', now() - interval '40 minutes') returning id into t;
  insert into messages (ticket_id, kind, body, created_at, email_id) values (t, 'customer', 'Bonjour, le transporteur doit livrer mon canapé cet après-midi mais l''adresse est l''ancienne : 12 rue des Lilas. La bonne est 4 avenue Foch, Lyon. Pouvez-vous le prévenir ? Nicolas Faure', now() - interval '40 minutes', '<b7@example.com>');
  insert into ticket_tags (ticket_id, tag_id) values (t, delivery);

  -- A request whose answer bounced: the customer mistyped their address.
  insert into tickets (number, subject, status, customer_email, customer_name, channel, secret_hash, language, assignee, created_at, updated_at, bounce)
  values (nextval('ticket_numbers'), 'Assembly instructions for the shelf', 'waiting', 'lucas.m@exmaple.com', 'Lucas Moreau', 'form', encode(sha256(convert_to(gen_random_uuid()::text, 'UTF8')), 'hex'), 'en', hugo, now() - interval '1 day', now() - interval '20 hours',
    jsonb_build_object('permanent', true, 'reason', '550 5.1.1 The email account that you tried to reach does not exist', 'at', now() - interval '20 hours', 'recipient', 'lucas.m@exmaple.com')) returning id into t;
  insert into messages (ticket_id, kind, body, created_at) values (t, 'customer', 'Hello, the instructions for the Oslo shelf were not in the box. Could you send them? Lucas', now() - interval '1 day');
  insert into messages (ticket_id, kind, author, body, created_at, delivery, mail_id, bounce) values (t, 'reply', hugo, 'Hello Lucas, here they are as a PDF. Hugo', now() - interval '20 hours', 'email', 'msg_aaaaaaaaaaaaaaaaaaaaaaaaaa',
    jsonb_build_object('permanent', true, 'reason', '550 5.1.1 The email account that you tried to reach does not exist', 'at', now() - interval '20 hours', 'recipient', 'lucas.m@exmaple.com'));

  -- A colleague's IT request (a team form of Forms): Nora has no role in
  -- Support; she reads Inès's answer in My requests (/chest/mine).
  insert into tickets (number, subject, status, customer_email, customer_name, channel, secret_hash, language, assignee, created_at, updated_at, requester, source)
  values (nextval('ticket_numbers'), 'Imprimante du bureau bloquée', 'waiting', '', '', 'forms', encode(sha256(convert_to(gen_random_uuid()::text, 'UTF8')), 'hex'), 'fr', ines, now() - interval '5 hours', now() - interval '2 hours', 'mbr_noraaaaaaaaaaaaaaaaaaaaaaa',
    jsonb_build_object('form', jsonb_build_object('id', '9', 'title', 'Demande informatique'), 'answer', jsonb_build_object('id', 'seedNoraPrinter1', 'path', null))) returning id into t;
  insert into messages (ticket_id, kind, body, created_at) values (t, 'customer', E'L''imprimante du premier étage affiche « bourrage papier » depuis ce matin, et rien n''en sort.', now() - interval '5 hours');
  insert into messages (ticket_id, kind, author, body, created_at) values (t, 'note', ines, 'Contrat de maintenance : appeler Bureau Services, réf. 2231.', now() - interval '3 hours');
  insert into messages (ticket_id, kind, author, body, created_at, delivery) values (t, 'reply', ines, E'Bonjour Nora,\n\nLe technicien de Bureau Services passe demain à 9 h. En attendant, l''imprimante du rez-de-chaussée marche.\n\nInès', now() - interval '2 hours', 'page');

  insert into saved_views (name, params, created_by) values ('Urgent deliveries', jsonb_build_object('folder', 'open', 'tag', delivery::text, 'sort', 'priority'), ines);
  insert into rules (field, value, tag, priority, assignee, created_by) values ('text', 'facture', 'Invoice', null, 'mbr_sofiaaaaaaaaaaaaaaaaaaaaaa', camille), ('from', 'lumiere-hotels.example', null, 'high', null, camille);

  insert into saved_replies (title, body, created_by) values
    ('Delivery time', E'Hello {customer},\n\nThank you for your message. Our pieces are made to order: count 3 to 4 weeks from the order, and the carrier calls you to agree on a time.\n\n{agent}', camille),
    ('Damaged item', E'Hello {customer},\n\nWe are sorry the item arrived damaged. Could you send us a photo? We will send a replacement at our cost.\n\n{agent}', camille);
end $$;
