-- Sample data for local runs and screenshots (never run by the Chest):
-- Atelier Martin's online shop. The member ids are the dev harness's
-- (lab/chest-dev/cast.mjs); times are relative to today, in Paris.
-- 90 days of history (six incidents, one maintenance done), one incident
-- being watched now, a maintenance planned next week, three subscribers.
create function pg_temp.at(days integer, minutes integer) returns timestamptz language sql as $$
  select (date_trunc('day', now() at time zone 'Europe/Paris') + make_interval(days => days, mins => minutes)) at time zone 'Europe/Paris'
$$;

-- An incident with its updates: steps is an array of [minutes after its
-- start, status, body, states as json {component name: impact}].
create function pg_temp.incident(title text, started timestamptz, author text, steps jsonb) returns bigint language plpgsql as $$
declare
  iid bigint; uid bigint; step jsonb; k text; v text; last_status text; last_at timestamptz;
begin
  insert into incidents (kind, title, status, started_at, created_by, created_at)
    values ('incident', title, 'investigating', started, author, started) returning id into iid;
  for step in select * from jsonb_array_elements(steps) loop
    last_at := started + make_interval(mins => (step->>0)::int);
    last_status := step->>1;
    insert into updates (incident_id, status, body, posted_at, author, created_at)
      values (iid, last_status, step->>2, last_at, coalesce(step->>4, author), last_at) returning id into uid;
    for k, v in select * from jsonb_each_text(coalesce(step->3, '{}'::jsonb)) loop
      insert into update_states (update_id, component_id, state) select uid, id, v from components where name = k and kind = 'component';
    end loop;
  end loop;
  update incidents set status = last_status, resolved_at = case when last_status = 'resolved' then last_at end where id = iid;
  return iid;
end $$;

do $$
declare
  camille text := 'mbr_camilleaaaaaaaaaaaaaaaaaaa';
  lea text := 'mbr_leaaaaaaaaaaaaaaaaaaaaaaaa';
  tom text := 'mbr_tomaaaaaaaaaaaaaaaaaaaaaaa';
  shop bigint; mid bigint; created timestamptz := pg_temp.at(-120, 600);
begin
  insert into components (kind, name, description, position, created_at) values ('component', 'Website', 'atelier-martin.fr, product pages and blog', 0, created);
  insert into components (kind, name, description, position, created_at) values ('group', 'Online shop', '', 1, created) returning id into shop;
  insert into components (kind, parent_id, name, description, position, created_at) values
    ('component', shop, 'Catalogue', 'Browsing and searching products', 0, created),
    ('component', shop, 'Checkout', 'Basket and ordering', 1, created),
    ('component', shop, 'Payments', 'Card and PayPal payments', 2, created);
  insert into components (kind, name, description, position, created_at) values
    ('component', 'Delivery tracking', 'Where is my parcel?', 2, created),
    ('component', 'Customer support', 'Chat, email and phone', 3, created);

  perform pg_temp.incident('Card payments failing', pg_temp.at(-78, 850), lea, jsonb_build_array(
    jsonb_build_array(0, 'investigating', 'Card payments are failing at checkout. We are looking into it. Orders already paid are safe.', jsonb_build_object('Payments', 'major', 'Checkout', 'partial')),
    jsonb_build_array(35, 'identified', 'Our payment provider has an outage on their side. We are in touch with them. PayPal still works.', jsonb_build_object('Payments', 'major', 'Checkout', 'partial')),
    jsonb_build_array(95, 'monitoring', 'The provider has fixed the issue. Card payments work again; we are watching closely.', jsonb_build_object('Payments', 'degraded')),
    jsonb_build_array(120, 'resolved', 'Everything works normally. If a payment failed for you during the outage, you were not charged: please order again.')));

  perform pg_temp.incident('Slow website', pg_temp.at(-61, 610), tom, jsonb_build_array(
    jsonb_build_array(0, 'investigating', 'Pages are loading slowly. We are on it.', jsonb_build_object('Website', 'degraded', 'Catalogue', 'degraded')),
    jsonb_build_array(20, 'identified', 'A traffic spike from our newsletter. We are adding capacity.', jsonb_build_object('Website', 'degraded', 'Catalogue', 'degraded')),
    jsonb_build_array(45, 'resolved', 'Pages load normally again.')));

  perform pg_temp.incident('Parcel tracking not updating', pg_temp.at(-44, 540), lea, jsonb_build_array(
    jsonb_build_array(0, 'investigating', 'Tracking pages show old information for some parcels. Deliveries themselves are not affected.', jsonb_build_object('Delivery tracking', 'partial')),
    jsonb_build_array(90, 'identified', 'Our carrier changed the format of their updates. We are adapting our side.', jsonb_build_object('Delivery tracking', 'partial')),
    jsonb_build_array(250, 'monitoring', 'A fix is in place; tracking is catching up.', jsonb_build_object('Delivery tracking', 'degraded')),
    jsonb_build_array(300, 'resolved', 'Tracking is up to date for every parcel.')));

  perform pg_temp.incident('Errors when placing an order', pg_temp.at(-30, 1170), camille, jsonb_build_array(
    jsonb_build_array(0, 'investigating', 'Some customers see an error when confirming their order. We are investigating.', jsonb_build_object('Checkout', 'degraded', 'Payments', 'partial')),
    jsonb_build_array(40, 'monitoring', 'We rolled back this afternoon''s update. Orders go through again.', jsonb_build_object('Checkout', 'degraded')),
    jsonb_build_array(80, 'resolved', 'Resolved. Orders placed during the incident were all recorded.')));

  perform pg_temp.incident('Live chat unavailable', pg_temp.at(-12, 600), tom, jsonb_build_array(
    jsonb_build_array(0, 'investigating', 'The chat window does not open. You can still reach us by email or phone.', jsonb_build_object('Customer support', 'partial')),
    jsonb_build_array(180, 'resolved', 'The chat works again.')));

  perform pg_temp.incident('Product images slow to load', pg_temp.at(-3, 900), lea, jsonb_build_array(
    jsonb_build_array(0, 'identified', 'Product photos load slowly: our image service is overloaded. We are moving it to a larger server.', jsonb_build_object('Catalogue', 'degraded')),
    jsonb_build_array(30, 'resolved', 'Images load quickly again.')));

  -- The incident being watched now: started five hours ago.
  perform pg_temp.incident('Delivery dates shown late', now() - interval '5 hours', lea, jsonb_build_array(
    jsonb_build_array(0, 'investigating', 'Some product pages show a delivery date one week later than the real one. Orders ship on time.', jsonb_build_object('Delivery tracking', 'partial', 'Catalogue', 'degraded')),
    jsonb_build_array(70, 'identified', 'A calendar of carrier holidays was loaded twice. We are correcting it.', jsonb_build_object('Delivery tracking', 'partial', 'Catalogue', 'degraded')),
    jsonb_build_array(240, 'monitoring', 'Dates are correct again on every page we checked. We keep watching until tomorrow morning.', jsonb_build_object('Delivery tracking', 'degraded'), tom)));

  -- A maintenance done 20 days ago.
  insert into incidents (kind, title, status, started_at, ends_at, auto_posts, start_posted, end_posted, created_by, created_at)
    values ('maintenance', 'Server upgrade', 'scheduled', pg_temp.at(-20, 1320), pg_temp.at(-20, 1360), true, true, true, camille, pg_temp.at(-24, 600)) returning id into mid;
  insert into maintenance_components (incident_id, component_id) select mid, id from components where name in ('Website', 'Catalogue');
  insert into updates (incident_id, status, body, posted_at, author) values
    (mid, 'scheduled', 'We are upgrading our servers. The website may be unavailable for up to 40 minutes.', pg_temp.at(-24, 600), camille),
    (mid, 'in_progress', 'The maintenance has started.', pg_temp.at(-20, 1320), 'auto'),
    (mid, 'completed', 'The maintenance is complete. Everything works normally.', pg_temp.at(-20, 1360), 'auto');

  -- Next week: the payment provider's upgrade, Tuesday 22:00–23:30.
  insert into incidents (kind, title, status, started_at, ends_at, auto_posts, created_by, created_at)
    values ('maintenance', 'Payment provider upgrade', 'scheduled',
      pg_temp.at(8 - extract(isodow from now() at time zone 'Europe/Paris')::int + 1, 1320),
      pg_temp.at(8 - extract(isodow from now() at time zone 'Europe/Paris')::int + 1, 1410), true, camille, now() - interval '2 days') returning id into mid;
  insert into maintenance_components (incident_id, component_id) select mid, id from components where name in ('Checkout', 'Payments');
  insert into updates (incident_id, status, body, posted_at, author) values
    (mid, 'scheduled', 'Our payment provider is upgrading its systems. Ordering and paying will be unavailable for about 90 minutes. Browsing the shop is not affected.', now() - interval '2 days', camille);

  insert into subscribers (email, language, components, token, created_at, confirmed_at) values
    ('marie.leroy@example.com', 'fr', null, 'demoSubscriberMarie0000000000000', now() - interval '80 days', now() - interval '80 days'),
    ('paul.bernard@example.com', 'en', null, 'demoSubscriberPaul00000000000000', now() - interval '41 days', now() - interval '41 days'),
    ('orders@example-shop.com', 'en', (select array_agg(id) from components where name in ('Checkout', 'Payments')), 'demoSubscriberShop00000000000000', now() - interval '9 days', now() - interval '9 days');
  -- The website is checked by the Chest (Proposal (studio): checks): a
  -- result an hour for the last 30 days (a real Chest checks every 5
  -- minutes), one hour without an answer during the slow-website day.
  insert into watches (component_id, name, url, every, expect_status, max_ms)
    select id, 'c-' || id, 'https://atelier-martin.fr/', 5, 200, 3000 from components where name = 'Website';
  insert into check_results (id, component_id, at, ok, status, ms, error)
    select 'chk_' || substr(translate(md5('seed' || h), '0189', 'abcd'), 1, 26), c.id, now() - make_interval(hours => h),
      h <> 400, case when h = 400 then null else 200 end, case when h = 400 then 10000 else 180 + (h % 7) * 23 end, case when h = 400 then 'timeout' end
    from generate_series(1, 720) h, components c where c.name = 'Website';
  insert into settings (key, value) values ('checks_state', '"running"');
  insert into settings (key, value) values ('mail_state', jsonb_build_object('state', 'ok', 'at', now()));
end $$;
