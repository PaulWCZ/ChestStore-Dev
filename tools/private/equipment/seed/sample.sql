-- Sample data for local runs and screenshots (never run by the Chest): the
-- equipment of a small company of the studio's cast (lab/chest-dev):
-- Camille and Sofia manage it; Inès, Hugo, Léa and Tom use it. Dates move
-- with today, so warranties and renewals end soon whenever it is loaded.
-- Categories 1–8 are the built-in ones of the migration (laptop, phone,
-- screen, accessory, licence, key, vehicle, other).

insert into items (category_id, tag, name, serial, status, purchased_on, price_cents, supplier, warranty_until, notes, holder, place, held_since, created_by, created_at) values
  (1, 'EQ-0001', 'MacBook Pro 14″ M3', 'C02XK1ZZMD6T', 'in_use', '2024-02-12', 239900, 'Apple Store Business', '2027-02-12', 'Charger and USB-C hub included.', 'mbr_camilleaaaaaaaaaaaaaaaaaaa', null, '2024-02-14', 'mbr_camilleaaaaaaaaaaaaaaaaaaa', '2024-02-12 10:00+01'),
  (1, 'EQ-0002', 'MacBook Air 13″ M2', 'FVFHJ3KLQ6L4', 'in_use', '2023-10-05', 129900, 'Apple Store Business', current_date + 24, null, 'mbr_inesaaaaaaaaaaaaaaaaaaaaaa', null, '2023-10-09', 'mbr_camilleaaaaaaaaaaaaaaaaaaa', '2023-10-05 09:30+02'),
  (1, 'EQ-0003', 'MacBook Air 13″ M2', 'FVFHJ3KLQ6M2', 'in_use', '2023-10-05', 129900, 'Apple Store Business', current_date + 24, null, 'mbr_hugoaaaaaaaaaaaaaaaaaaaaaa', null, '2024-09-02', 'mbr_camilleaaaaaaaaaaaaaaaaaaa', '2023-10-05 09:31+02'),
  (1, 'EQ-0004', 'Dell XPS 15 9530', '7XK2JH3', 'in_use', '2024-06-20', 189000, 'Dell Technologies', '2027-06-20', '32 GB RAM, 1 TB.', 'mbr_tomaaaaaaaaaaaaaaaaaaaaaaa', null, '2024-06-24', 'mbr_camilleaaaaaaaaaaaaaaaaaaa', '2024-06-20 14:00+02'),
  (1, 'EQ-0005', 'Dell XPS 15 9530', '7XK2JH9', 'in_use', '2024-06-20', 189000, 'Dell Technologies', '2027-06-20', null, 'mbr_leaaaaaaaaaaaaaaaaaaaaaaaa', null, '2024-07-01', 'mbr_camilleaaaaaaaaaaaaaaaaaaa', '2024-06-20 14:01+02'),
  (1, 'EQ-0006', 'Lenovo ThinkPad T14 Gen 4', 'PF4KQ7Z1', 'in_use', '2025-01-15', 134900, 'LDLC Pro', '2028-01-15', null, 'mbr_sofiaaaaaaaaaaaaaaaaaaaaaa', null, '2025-01-20', 'mbr_camilleaaaaaaaaaaaaaaaaaaa', '2025-01-15 11:00+01'),
  (1, 'EQ-0007', 'Lenovo ThinkPad T14 Gen 4', 'PF4KQ7Z8', 'in_stock', '2025-01-15', 134900, 'LDLC Pro', '2028-01-15', 'Spare, for newcomers. Wiped and ready.', null, null, null, 'mbr_camilleaaaaaaaaaaaaaaaaaaa', '2025-01-15 11:01+01'),
  (1, 'EQ-0008', 'MacBook Pro 13″ (2020)', 'C02DQ0AHP3XY', 'in_repair', '2020-09-01', 149900, 'Apple Store Business', '2023-09-01', null, null, null, null, 'mbr_camilleaaaaaaaaaaaaaaaaaaa', '2020-09-01 10:00+02'),
  (1, 'EQ-0009', 'HP EliteBook 840 G6', '5CG9281KLM', 'retired', '2019-04-02', 109000, 'Bechtle', '2022-04-02', 'Sold to an employee in 2025.', null, null, null, 'mbr_camilleaaaaaaaaaaaaaaaaaaa', '2019-04-02 10:00+02'),
  (2, 'EQ-0010', 'iPhone 15', 'F2LXK9P1N7', 'in_use', '2024-01-10', 96900, 'Orange Business', current_date + 48, 'Line 06 12 34 56 78.', 'mbr_hugoaaaaaaaaaaaaaaaaaaaaaa', null, '2024-01-12', 'mbr_camilleaaaaaaaaaaaaaaaaaaa', '2024-01-10 10:00+01'),
  (2, 'EQ-0011', 'iPhone 15', 'F2LXK9P1R2', 'in_use', '2024-01-10', 96900, 'Orange Business', current_date + 48, null, 'mbr_inesaaaaaaaaaaaaaaaaaaaaaa', null, '2024-01-12', 'mbr_camilleaaaaaaaaaaaaaaaaaaa', '2024-01-10 10:01+01'),
  (2, 'EQ-0012', 'iPhone 13', 'DX3QP8L2M9', 'in_use', '2022-03-18', 80900, 'Orange Business', '2024-03-18', null, 'mbr_camilleaaaaaaaaaaaaaaaaaaa', null, '2022-03-20', 'mbr_camilleaaaaaaaaaaaaaaaaaaa', '2022-03-18 10:00+01'),
  (2, 'EQ-0013', 'Samsung Galaxy S23', 'R58T30AB1CD', 'in_use', '2023-05-02', 89900, 'Boulanger Pro', '2025-05-02', null, 'mbr_tomaaaaaaaaaaaaaaaaaaaaaaa', null, '2023-05-04', 'mbr_camilleaaaaaaaaaaaaaaaaaaa', '2023-05-02 10:00+02'),
  (2, 'EQ-0014', 'Samsung Galaxy A54', 'R58W11XY9ZQ', 'in_stock', '2024-11-08', 39900, 'Boulanger Pro', '2026-11-08', 'Spare phone for on-call week.', null, null, null, 'mbr_camilleaaaaaaaaaaaaaaaaaaa', '2024-11-08 10:00+01'),
  (2, 'EQ-0015', 'iPhone SE (2022)', 'GH7QK2LM1P', 'lost', '2022-06-01', 52900, 'Orange Business', '2024-06-01', null, null, null, null, 'mbr_camilleaaaaaaaaaaaaaaaaaaa', '2022-06-01 10:00+02'),
  (3, 'EQ-0016', 'Dell UltraSharp 27″ U2723QE', 'CN-0XK1-74261', 'in_use', '2024-03-04', 54900, 'Dell Technologies', '2027-03-04', null, null, 'Meeting room Atlas', '2024-03-06', 'mbr_camilleaaaaaaaaaaaaaaaaaaa', '2024-03-04 10:00+01'),
  (3, 'EQ-0017', 'Dell UltraSharp 27″ U2723QE', 'CN-0XK1-74262', 'in_use', '2024-03-04', 54900, 'Dell Technologies', '2027-03-04', null, 'mbr_tomaaaaaaaaaaaaaaaaaaaaaaa', null, '2024-03-06', 'mbr_camilleaaaaaaaaaaaaaaaaaaa', '2024-03-04 10:01+01'),
  (3, 'EQ-0018', 'Dell UltraSharp 27″ U2723QE', 'CN-0XK1-74263', 'in_use', '2024-03-04', 54900, 'Dell Technologies', '2027-03-04', null, 'mbr_leaaaaaaaaaaaaaaaaaaaaaaaa', null, '2024-07-01', 'mbr_camilleaaaaaaaaaaaaaaaaaaa', '2024-03-04 10:02+01'),
  (3, 'EQ-0019', 'LG 27UL850-W', '104NTAB3X221', 'in_use', '2021-11-22', 42900, 'LDLC Pro', '2023-11-22', null, 'mbr_camilleaaaaaaaaaaaaaaaaaaa', null, '2021-11-25', 'mbr_camilleaaaaaaaaaaaaaaaaaaa', '2021-11-22 10:00+01'),
  (3, 'EQ-0020', 'Samsung Smart Monitor M7 32″', '0T9NH4LR200145', 'in_use', '2025-02-10', 39900, 'Boulanger Pro', current_date + 57, 'Shows the visitor welcome screen.', null, 'Reception', '2025-02-11', 'mbr_sofiaaaaaaaaaaaaaaaaaaaaaa', '2025-02-10 10:00+01'),
  (3, 'EQ-0021', 'Dell P2422H', 'CN-0DXT-11890', 'in_stock', '2023-01-09', 21900, 'Dell Technologies', '2026-01-09', null, null, null, null, 'mbr_camilleaaaaaaaaaaaaaaaaaaa', '2023-01-09 10:00+01'),
  (3, 'EQ-0022', 'Dell P2422H', 'CN-0DXT-11891', 'in_stock', '2023-01-09', 21900, 'Dell Technologies', '2026-01-09', null, null, null, null, 'mbr_camilleaaaaaaaaaaaaaaaaaaa', '2023-01-09 10:01+01'),
  (4, 'EQ-0023', 'Jabra Evolve2 65 headset', 'JB65-22K0931', 'in_use', '2024-04-15', 21900, 'Amazon Business', '2026-04-15', null, 'mbr_hugoaaaaaaaaaaaaaaaaaaaaaa', null, '2024-04-16', 'mbr_sofiaaaaaaaaaaaaaaaaaaaaaa', '2024-04-15 10:00+02'),
  (4, 'EQ-0024', 'Jabra Evolve2 65 headset', 'JB65-22K0932', 'in_use', '2024-04-15', 21900, 'Amazon Business', '2026-04-15', null, 'mbr_inesaaaaaaaaaaaaaaaaaaaaaa', null, '2024-04-16', 'mbr_sofiaaaaaaaaaaaaaaaaaaaaaa', '2024-04-15 10:01+02'),
  (4, 'EQ-0025', 'CalDigit TS4 dock', 'TS4-EU-3319', 'in_use', '2024-06-20', 39999, 'LDLC Pro', '2026-06-20', null, 'mbr_tomaaaaaaaaaaaaaaaaaaaaaaa', null, '2024-06-24', 'mbr_camilleaaaaaaaaaaaaaaaaaaa', '2024-06-20 15:00+02'),
  (4, 'EQ-0026', 'Logitech MX Keys + MX Master 3S', null, 'in_use', '2024-07-01', 22900, 'Amazon Business', null, 'French AZERTY layout.', 'mbr_leaaaaaaaaaaaaaaaaaaaaaaaa', null, '2024-07-01', 'mbr_sofiaaaaaaaaaaaaaaaaaaaaaa', '2024-07-01 10:00+02'),
  (4, 'EQ-0027', 'Logitech MX Keys + MX Master 3S', null, 'in_stock', '2024-07-01', 22900, 'Amazon Business', null, 'US QWERTY layout.', null, null, null, 'mbr_sofiaaaaaaaaaaaaaaaaaaaaaa', '2024-07-01 10:01+02'),
  (8, 'EQ-0028', 'Epson EB-L200F projector', 'X8KF2300571', 'in_use', '2023-09-12', 119000, 'Bechtle', current_date + 12, 'Remote in the drawer under the screen.', null, 'Meeting room Atlas', '2023-09-14', 'mbr_sofiaaaaaaaaaaaaaaaaaaaaaa', '2023-09-12 10:00+02'),
  (8, 'EQ-0029', 'Brother HL-L3270CDW printer', 'E78123K0N551234', 'in_use', '2022-05-30', 32900, 'Boulanger Pro', '2025-05-30', null, null, 'Office, 2nd floor', '2022-06-01', 'mbr_sofiaaaaaaaaaaaaaaaaaaaaaa', '2022-05-30 10:00+02'),
  (6, 'EQ-0033', 'Front door key 1', null, 'in_use', '2021-01-04', null, null, null, null, 'mbr_camilleaaaaaaaaaaaaaaaaaaa', null, '2021-01-04', 'mbr_camilleaaaaaaaaaaaaaaaaaaa', '2021-01-04 09:00+01'),
  (6, 'EQ-0034', 'Front door key 2', null, 'in_use', '2021-01-04', null, null, null, null, 'mbr_sofiaaaaaaaaaaaaaaaaaaaaaa', null, '2022-09-01', 'mbr_camilleaaaaaaaaaaaaaaaaaaa', '2021-01-04 09:01+01'),
  (6, 'EQ-0035', 'Front door key 3', null, 'in_stock', '2021-01-04', null, null, null, 'In the safe.', null, null, null, 'mbr_camilleaaaaaaaaaaaaaaaaaaa', '2021-01-04 09:02+01'),
  (6, 'EQ-0036', 'Access badge 014', 'B-014', 'in_use', '2023-02-01', 1500, 'Nedap', null, null, 'mbr_hugoaaaaaaaaaaaaaaaaaaaaaa', null, '2023-02-01', 'mbr_sofiaaaaaaaaaaaaaaaaaaaaaa', '2023-02-01 09:00+01'),
  (6, 'EQ-0037', 'Access badge 015', 'B-015', 'in_use', '2023-02-01', 1500, 'Nedap', null, null, 'mbr_inesaaaaaaaaaaaaaaaaaaaaaa', null, '2023-02-01', 'mbr_sofiaaaaaaaaaaaaaaaaaaaaaa', '2023-02-01 09:01+01'),
  (6, 'EQ-0038', 'Access badge 016', 'B-016', 'in_use', '2023-02-01', 1500, 'Nedap', null, null, 'mbr_leaaaaaaaaaaaaaaaaaaaaaaaa', null, '2024-07-01', 'mbr_sofiaaaaaaaaaaaaaaaaaaaaaa', '2023-02-01 09:02+01'),
  (6, 'EQ-0039', 'Access badge 017', 'B-017', 'in_use', '2023-02-01', 1500, 'Nedap', null, null, 'mbr_tomaaaaaaaaaaaaaaaaaaaaaaa', null, '2023-02-01', 'mbr_sofiaaaaaaaaaaaaaaaaaaaaaa', '2023-02-01 09:03+01'),
  (6, 'EQ-0040', 'Car park remote', 'CP-2', 'in_use', '2022-01-10', 4500, null, null, null, 'mbr_sofiaaaaaaaaaaaaaaaaaaaaaa', null, '2022-01-10', 'mbr_camilleaaaaaaaaaaaaaaaaaaa', '2022-01-10 09:00+01'),
  (7, 'EQ-0041', 'Renault Kangoo E-Tech (GH-482-KT)', 'VF1FW0ZH567123456', 'in_use', '2023-06-15', 3490000, 'Renault Pro+', '2026-06-15', 'Charge card in the glove box.', null, 'Car park, space 12', '2023-06-20', 'mbr_camilleaaaaaaaaaaaaaaaaaaa', '2023-06-15 09:00+02');

-- Licences and subscriptions: seats, a renewal, a cost per period.
insert into items (category_id, tag, name, status, supplier, seats, renews_on, cost_cents, period, notes, created_by, created_at) values
  (5, 'EQ-0030', 'Figma Professional', 'in_use', 'Figma', 5, current_date + 38, 7500, 'month', 'Admin: Camille.', 'mbr_camilleaaaaaaaaaaaaaaaaaaa', '2024-01-05 10:00+01'),
  (5, 'EQ-0031', 'Adobe Creative Cloud', 'in_use', 'Adobe', 3, '2027-03-01', 108000, 'year', null, 'mbr_camilleaaaaaaaaaaaaaaaaaaa', '2024-03-01 10:00+01'),
  (5, 'EQ-0032', 'Microsoft 365 Business Standard', 'in_use', 'Microsoft', 10, current_date + 53, 15000, 'year', 'Per seat per year.', 'mbr_camilleaaaaaaaaaaaaaaaaaaa', '2023-01-02 10:00+01');

insert into seats (item_id, member_id, since)
select i.id, s.member_id, s.since::timestamptz from items i join (values
  ('EQ-0030', 'mbr_leaaaaaaaaaaaaaaaaaaaaaaaa', '2024-07-01 10:00+02'),
  ('EQ-0030', 'mbr_tomaaaaaaaaaaaaaaaaaaaaaaa', '2024-01-05 10:00+01'),
  ('EQ-0030', 'mbr_camilleaaaaaaaaaaaaaaaaaaa', '2024-01-05 10:00+01'),
  ('EQ-0031', 'mbr_leaaaaaaaaaaaaaaaaaaaaaaaa', '2024-07-01 10:00+02'),
  ('EQ-0031', 'mbr_hugoaaaaaaaaaaaaaaaaaaaaaa', '2024-03-01 10:00+01'),
  ('EQ-0032', 'mbr_camilleaaaaaaaaaaaaaaaaaaa', '2023-01-02 10:00+01'),
  ('EQ-0032', 'mbr_sofiaaaaaaaaaaaaaaaaaaaaaa', '2023-01-02 10:00+01'),
  ('EQ-0032', 'mbr_inesaaaaaaaaaaaaaaaaaaaaaa', '2023-01-02 10:00+01'),
  ('EQ-0032', 'mbr_hugoaaaaaaaaaaaaaaaaaaaaaa', '2023-01-02 10:00+01'),
  ('EQ-0032', 'mbr_tomaaaaaaaaaaaaaaaaaaaaaaa', '2023-01-02 10:00+01'),
  ('EQ-0032', 'mbr_leaaaaaaaaaaaaaaaaaaaaaaaa', '2024-07-01 10:00+02')
) as s (tag, member_id, since) on s.tag = i.tag;

-- The history: each item added, then given; a few stories on top.
insert into history (item_id, at, actor, kind, status)
select id, created_at, created_by, 'created', 'in_stock' from items;

insert into history (item_id, at, actor, kind, member, place, day)
select id, held_since::timestamp + interval '10 hours', created_by, 'given', holder, place, held_since from items where held_since is not null;

insert into history (item_id, at, actor, kind, member, day)
select s.item_id, s.since, 'mbr_camilleaaaaaaaaaaaaaaaaaaa', 'seat_given', s.member_id, s.since::date from seats s;

-- EQ-0003 went to Hugo after Tom; EQ-0008 came back from Tom for repair;
-- EQ-0015 was lost in a taxi.
insert into history (item_id, at, actor, kind, member, place, status, note, day)
select i.id, h.at::timestamptz, h.actor, h.kind, h.member, null, h.status, h.note, h.day::date from items i join (values
  ('EQ-0003', '2023-10-09 11:00+02', 'mbr_camilleaaaaaaaaaaaaaaaaaaa', 'given', 'mbr_tomaaaaaaaaaaaaaaaaaaaaaaa', null, null, '2023-10-09'),
  ('EQ-0003', '2024-06-24 11:00+02', 'mbr_camilleaaaaaaaaaaaaaaaaaaa', 'returned', 'mbr_tomaaaaaaaaaaaaaaaaaaaaaaa', 'in_stock', 'Good condition, charger returned.', '2024-06-24'),
  ('EQ-0008', '2020-09-02 10:00+02', 'mbr_camilleaaaaaaaaaaaaaaaaaaa', 'given', 'mbr_tomaaaaaaaaaaaaaaaaaaaaaaa', null, null, '2020-09-02'),
  ('EQ-0008', '2024-06-24 11:05+02', 'mbr_camilleaaaaaaaaaaaaaaaaaaa', 'returned', 'mbr_tomaaaaaaaaaaaaaaaaaaaaaaa', 'in_repair', 'B and N keys stuck. Sent to the repair shop.', '2024-06-24'),
  ('EQ-0015', '2022-06-02 10:00+02', 'mbr_camilleaaaaaaaaaaaaaaaaaaa', 'given', 'mbr_hugoaaaaaaaaaaaaaaaaaaaaaa', null, null, '2022-06-02'),
  ('EQ-0015', '2023-12-11 18:20+01', 'mbr_sofiaaaaaaaaaaaaaaaaaaaaaa', 'returned', 'mbr_hugoaaaaaaaaaaaaaaaaaaaaaa', 'lost', null, '2023-12-11'),
  ('EQ-0015', '2023-12-11 18:21+01', 'mbr_sofiaaaaaaaaaaaaaaaaaaaaaa', 'status', null, 'lost', 'Forgotten in a taxi; the line was blocked.', null),
  ('EQ-0009', '2025-03-03 10:00+01', 'mbr_camilleaaaaaaaaaaaaaaaaaaa', 'status', null, 'retired', 'Sold to an employee.', null)
) as h (tag, at, actor, kind, member, status, note, day) on h.tag = i.tag;

-- An open problem, reported by Inès two days ago.
insert into problems (item_id, reported_by, body, created_at)
select id, 'mbr_inesaaaaaaaaaaaaaaaaaaaaaa', 'La batterie ne tient plus qu’une heure, même en veille.', now() - interval '2 days' from items where tag = 'EQ-0002';
insert into history (item_id, at, actor, kind, note)
select item_id, created_at, reported_by, 'reported', body from problems;

-- Told by People (events between tools): Léa's last day is in about twelve
-- days — a working day (a Saturday or Sunday moves to the Monday).
insert into departures (member_id, last_day, told_at)
select 'mbr_leaaaaaaaaaaaaaaaaaaaaaaaa', d + case extract(isodow from d) when 6 then 2 when 7 then 1 else 0 end, now()
from (select (now() at time zone 'Europe/Paris')::date + 12 as d) x;

-- ---- After the critique (migration 0003) --------------------------------------

-- Fields of their own: phones' IMEI, laptops' memory and system, vehicles'
-- plate and next inspection.
-- The fields the tool proposes carry a key: their names are the
-- catalogue's, in each reader's language, until a manager renames them.
insert into fields (category_id, name, key, type, position) values
  (2, 'IMEI', 'imei', 'text', 1),
  (1, 'RAM (GB)', 'ram', 'number', 1),
  (1, 'Operating system', 'os', 'text', 2),
  (7, 'Licence plate', 'plate', 'text', 1),
  (7, 'Next inspection', 'inspection', 'date', 2);
update items i set extra = x.extra from (values
  ('EQ-0001', jsonb_build_object((select id::text from fields where name = 'RAM (GB)'), '18', (select id::text from fields where name = 'Operating system'), 'macOS 15')),
  ('EQ-0002', jsonb_build_object((select id::text from fields where name = 'RAM (GB)'), '8', (select id::text from fields where name = 'Operating system'), 'macOS 14')),
  ('EQ-0003', jsonb_build_object((select id::text from fields where name = 'RAM (GB)'), '8', (select id::text from fields where name = 'Operating system'), 'macOS 15')),
  ('EQ-0004', jsonb_build_object((select id::text from fields where name = 'RAM (GB)'), '32', (select id::text from fields where name = 'Operating system'), 'Windows 11 Pro')),
  ('EQ-0005', jsonb_build_object((select id::text from fields where name = 'RAM (GB)'), '32', (select id::text from fields where name = 'Operating system'), 'Windows 11 Pro')),
  ('EQ-0010', jsonb_build_object((select id::text from fields where name = 'IMEI'), '356938035643809')),
  ('EQ-0011', jsonb_build_object((select id::text from fields where name = 'IMEI'), '356938035643817')),
  ('EQ-0012', jsonb_build_object((select id::text from fields where name = 'IMEI'), '353918052347221')),
  ('EQ-0013', jsonb_build_object((select id::text from fields where name = 'IMEI'), '352099001761481')),
  ('EQ-0041', jsonb_build_object((select id::text from fields where name = 'Licence plate'), 'GH-482-KT', (select id::text from fields where name = 'Next inspection'), to_char(current_date + 140, 'YYYY-MM-DD')))
) as x (tag, extra) where i.tag = x.tag;

-- Supplies counted in bulk (category 9): the chargers are running low.
insert into items (category_id, tag, name, status, supplier, quantity, min_quantity, notes, created_by, created_at) values
  (9, 'SUP-001', 'USB-C charger 65 W', 'in_stock', 'LDLC Pro', 2, 3, null, 'mbr_sofiaaaaaaaaaaaaaaaaaaaaaa', '2025-01-10 10:00+01'),
  (9, 'SUP-002', 'HDMI cable 2 m', 'in_stock', 'Amazon Business', 12, 4, null, 'mbr_sofiaaaaaaaaaaaaaaaaaaaaaa', '2025-01-10 10:01+01'),
  (9, 'SUP-003', 'Toner HP 26A', 'in_stock', 'Bureau Vallée', 3, 2, 'For the Brother on the 2nd floor, check the model first.', 'mbr_sofiaaaaaaaaaaaaaaaaaaaaaa', '2025-01-10 10:02+01'),
  (9, 'SUP-004', 'Visitor badge', 'in_stock', 'Nedap', 40, 10, null, 'mbr_sofiaaaaaaaaaaaaaaaaaaaaaa', '2025-01-10 10:03+01');
insert into history (item_id, at, actor, kind, status, qty)
select id, created_at, created_by, 'created', 'in_stock', quantity from items where tag like 'SUP-%';
insert into history (item_id, at, actor, kind, member, qty, day)
select id, now() - interval '3 days', 'mbr_sofiaaaaaaaaaaaaaaaaaaaaaa', 'handed_out', 'mbr_tomaaaaaaaaaaaaaaaaaaaaaaa', 1, current_date - 3 from items where tag = 'SUP-001';

-- A fresh handover: the spare US keyboard went to Hugo two days ago.
update items set holder = 'mbr_hugoaaaaaaaaaaaaaaaaaaaaaa', status = 'in_use', held_since = current_date - 2 where tag = 'EQ-0027';
insert into history (item_id, at, actor, kind, member, note, day)
select id, now() - interval '2 days', 'mbr_sofiaaaaaaaaaaaaaaaaaaaaaa', 'given', holder, 'Box opened once, like new', current_date - 2 from items where tag = 'EQ-0027';

-- The rules people accept when they confirm they received something.
-- The tool's example rules (read in each reader's language).
insert into charters (body, example, created_by, created_at) values
  ('The equipment remains the company’s property and is for your work.
Keep it with you or locked away; never leave a laptop in a car.
Report any loss, theft or damage the same day, from “My equipment”.
Return everything, with its chargers and accessories, on your last day.', true, 'mbr_camilleaaaaaaaaaaaaaaaaaaa', '2025-01-02 09:00+01');

-- Receipts: most things held were confirmed the day after; Hugo has the
-- keyboard to confirm, and Léa never confirmed her badge.
insert into receipts (item_id, member_id, given_by, given_on, condition, created_at, confirmed_at, remark, charter_id)
select i.id, i.holder, h.actor, i.held_since, h.note, i.held_since::timestamptz + interval '10 hours',
  case when i.tag in ('EQ-0027', 'EQ-0038') then null else greatest(i.held_since::timestamptz, '2025-01-02'::timestamptz) + interval '1 day 8 hours 14 minutes' end,
  case when i.tag = 'EQ-0011' then 'Petite rayure sur le dos, déjà là à la remise.' end,
  case when i.tag in ('EQ-0027', 'EQ-0038') then null else (select id from charters order by id limit 1) end
from items i join lateral (select actor, note from history where item_id = i.id and kind = 'given' order by id desc limit 1) h on true
where i.holder like 'mbr_%';
insert into history (item_id, at, actor, kind, member, note, ref)
select r.item_id, r.confirmed_at, r.member_id, 'received', r.member_id, r.remark, 'charter:' || r.charter_id from receipts r where r.confirmed_at is not null;

-- Requests: Inès waits for an answer; Hugo's was approved (it is ordered).
insert into requests (member_id, body, category_id, created_at, updated_at) values
  ('mbr_inesaaaaaaaaaaaaaaaaaaaaaa', 'Un second écran pour le télétravail, le mien est trop petit pour les tableaux.', 3, now() - interval '3 hours', now() - interval '3 hours');
insert into requests (member_id, body, category_id, status, answer, decided_by, decided_at, created_at, updated_at) values
  ('mbr_hugoaaaaaaaaaaaaaaaaaaaaaa', 'A second charger, to keep one at home.', 4, 'approved', 'Ordered, it arrives on Friday.', 'mbr_sofiaaaaaaaaaaaaaaaaaaaaaa', now() - interval '1 day', now() - interval '2 days', now() - interval '1 day');

-- EQ-0008 went to the repairer with a ticket; it is due back in five days.
insert into history (item_id, at, actor, kind, status, note, ref, due)
select id, now() - interval '9 days', 'mbr_camilleaaaaaaaaaaaaaaaaaaa', 'status', 'in_repair', 'Keyboard replaced under a paid repair.', 'RMA-20431', current_date + 5 from items where tag = 'EQ-0008';

-- Last spring's inventory: everything seen but the printer.
insert into inventories (started_by, started_at, closed_by, closed_at, total, seen) values
  ('mbr_sofiaaaaaaaaaaaaaaaaaaaaaa', now() - interval '120 days', 'mbr_sofiaaaaaaaaaaaaaaaaaaaaaa', now() - interval '119 days', 0, 0);
insert into sightings (inventory_id, item_id, seen_by, seen_at)
select 1, i.id, 'mbr_sofiaaaaaaaaaaaaaaaaaaaaaa', now() - interval '120 days' + (i.id || ' minutes')::interval
from items i join categories c on c.id = i.category_id where c.kind = 'asset' and i.status not in ('lost', 'retired') and i.tag <> 'EQ-0029';
insert into inventory_missing (inventory_id, item_id) select 1, id from items where tag = 'EQ-0029';
update inventories set seen = (select count(*) from sightings where inventory_id = 1), total = (select count(*) from sightings where inventory_id = 1) + 1 where id = 1;

-- This autumn's inventory is under way: Sofia started it an hour ago and
-- has seen the first laptops.
insert into inventories (started_by, started_at) values ('mbr_sofiaaaaaaaaaaaaaaaaaaaaaa', now() - interval '1 hour');
insert into sightings (inventory_id, item_id, seen_by, seen_at)
select 2, id, 'mbr_sofiaaaaaaaaaaaaaaaaaaaaaa', now() - interval '50 minutes' + (id || ' minutes')::interval from items where tag in ('EQ-0001', 'EQ-0006', 'EQ-0007', 'EQ-0016', 'EQ-0020', 'EQ-0028');
