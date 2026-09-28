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
  insert into tags (name) values ('Damaged') returning id into damaged;
  insert into tags (name) values ('Delivery') returning id into delivery;
  insert into tags (name) values ('Invoice') returning id into invoice;
  insert into tags (name) values ('Order change');

  insert into settings (key, value) values ('company_name', '"Atelier Martin"'), ('intro', '"Questions about an order, a delivery or an invoice? Write to us: we answer within one working day."');

  insert into tickets (number, subject, status, customer_email, customer_name, channel, secret_hash, language, created_at, updated_at, priority, waiting_since)
  values (nextval('ticket_numbers'), 'My lamp arrived broken', 'open', 'jean.dupont@example.com', 'Jean Dupont', 'form', encode(sha256(convert_to('demoLampFollowUpLinkForScreens00', 'UTF8')), 'hex'), 'fr', now() - interval '3 hours', now() - interval '3 hours', 'high', now() - interval '3 hours') returning id into t;
  insert into ticket_tags (ticket_id, tag_id) values (t, damaged);
  insert into messages (ticket_id, kind, body, created_at) values (t, 'customer', 'Bonjour, la lampe Arco que j''ai reçue hier a le pied fêlé. Je joins une photo. Pouvez-vous l''échanger ? Merci, Jean', now() - interval '3 hours');

  insert into tickets (number, subject, status, customer_email, customer_name, channel, secret_hash, language, created_at, updated_at, waiting_since)
  values (nextval('ticket_numbers'), 'Invoice for order 4471', 'open', 'accounts@lumiere-hotels.example', 'Sarah Klein', 'email', encode(sha256(convert_to(gen_random_uuid()::text, 'UTF8')), 'hex'), 'en', now() - interval '26 hours', now() - interval '26 hours', now() - interval '26 hours') returning id into t;
  insert into ticket_tags (ticket_id, tag_id) values (t, invoice);
  insert into messages (ticket_id, kind, body, created_at, email_id) values (t, 'customer', 'Hello, could you send the invoice for order 4471 with our VAT number FR12 345678901? Thank you. Sarah Klein, Lumière Hotels', now() - interval '26 hours', '<a1@lumiere-hotels.example>');

  insert into tickets (number, subject, status, customer_email, customer_name, channel, secret_hash, language, assignee, created_at, updated_at)
  values (nextval('ticket_numbers'), 'When will my table be delivered?', 'waiting', 'marie.leroy@example.com', 'Marie Leroy', 'form', encode(sha256(convert_to('demoFollowUpLinkForTheScreens000', 'UTF8')), 'hex'), 'en', ines, now() - interval '2 days', now() - interval '20 hours') returning id into t;
  insert into ticket_tags (ticket_id, tag_id) values (t, delivery);
  insert into messages (ticket_id, kind, body, created_at) values (t, 'customer', 'Hi, I ordered the oak dining table on the 12th. The confirmation said 3 weeks. Is it still on time? Marie', now() - interval '2 days');
  insert into messages (ticket_id, kind, author, body, created_at) values (t, 'note', ines, 'Workshop says varnish is drying, ships Thursday.', now() - interval '21 hours');
  insert into messages (ticket_id, kind, author, body, created_at, delivery) values (t, 'reply', ines, 'Hello Marie, good news: your table leaves our workshop on Thursday and the carrier will call you to agree on a time. Inès', now() - interval '20 hours', 'page');

  insert into tickets (number, subject, status, customer_email, customer_name, channel, secret_hash, language, assignee, created_at, updated_at, priority, waiting_since)
  values (nextval('ticket_numbers'), 'Can I change the fabric of my sofa?', 'open', 'paul.b@example.com', 'Paul Bernard', 'team', encode(sha256(convert_to(gen_random_uuid()::text, 'UTF8')), 'hex'), 'fr', hugo, now() - interval '5 hours', now() - interval '5 hours', 'low', now() - interval '5 hours') returning id into t;
  insert into ticket_tags (ticket_id, tag_id) select t, id from tags where name = 'Order change';
  insert into messages (ticket_id, kind, author, body, created_at) values (t, 'customer', hugo, 'Appel de M. Bernard : il voudrait passer du velours vert au lin naturel sur la commande 4502. À vérifier avec l''atelier.', now() - interval '5 hours');

  insert into tickets (number, subject, status, customer_email, customer_name, channel, secret_hash, language, assignee, created_at, updated_at, closed_at)
  values (nextval('ticket_numbers'), 'Opening hours in December', 'closed', 'claire@example.com', 'Claire', 'form', encode(sha256(convert_to(gen_random_uuid()::text, 'UTF8')), 'hex'), 'en', camille, now() - interval '9 days', now() - interval '8 days', now() - interval '8 days') returning id into t;
  insert into messages (ticket_id, kind, body, created_at) values (t, 'customer', 'Are you open between Christmas and New Year?', now() - interval '9 days');
  insert into messages (ticket_id, kind, author, body, created_at, delivery) values (t, 'reply', camille, 'Hello Claire, the showroom is open on the 27th, 28th and 30th, 10:00–18:00. Camille', now() - interval '8 days', 'email');

  insert into tickets (number, subject, status, customer_email, customer_name, channel, secret_hash, language, created_at, updated_at, priority, waiting_since)
  values (nextval('ticket_numbers'), 'Wrong address on today''s delivery', 'open', 'n.faure@example.com', 'Nicolas Faure', 'email', encode(sha256(convert_to(gen_random_uuid()::text, 'UTF8')), 'hex'), 'fr', now() - interval '40 minutes', now() - interval '40 minutes', 'urgent', now() - interval '40 minutes') returning id into t;
  insert into messages (ticket_id, kind, body, created_at, email_id) values (t, 'customer', 'Bonjour, le transporteur doit livrer mon canapé cet après-midi mais l''adresse est l''ancienne : 12 rue des Lilas. La bonne est 4 avenue Foch, Lyon. Pouvez-vous le prévenir ? Nicolas Faure', now() - interval '40 minutes', '<b7@example.com>');
  insert into ticket_tags (ticket_id, tag_id) values (t, delivery);

  insert into saved_replies (title, body, created_by) values
    ('Delivery time', 'Hello {customer},\n\nThank you for your message. Our pieces are made to order: count 3 to 4 weeks from the order, and the carrier calls you to agree on a time.\n\n{agent}', camille),
    ('Damaged item', 'Hello {customer},\n\nWe are sorry the item arrived damaged. Could you send us a photo? We will send a replacement at our cost.\n\n{agent}', camille);
end $$;
