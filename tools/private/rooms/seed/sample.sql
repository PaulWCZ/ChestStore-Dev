-- Sample data for local runs and screenshots (never run by the Chest). The
-- member ids are those of the studio's dev harness (lab/chest-dev): camille
-- (admin), ines, hugo, lea, tom, sofia. Days are counted from the Monday of
-- the current week, so the sample always shows this week and the next.
-- Times are read in Europe/Paris, the harness's time zone.

insert into offices (name, address, position) values ('Paris — Rue de Paradis', '12 rue de Paradis, 75010 Paris', 0);

-- Floors and areas the sample names are keys (preset): each reader sees
-- them in their own language until an admin renames them.
insert into floors (office_id, name, preset, position)
select id, f.name, f.preset, f.position from offices, (values ('Ground floor', 'ground', 0), ('First floor', 'first', 1)) as f(name, preset, position);

insert into rooms (floor_id, name, capacity, equipment, note, position)
select fl.id, r.name, r.capacity, r.equipment, r.note, r.position
from (values
  ('First floor', 'Atlas', 8, array['screen', 'video', 'whiteboard'], 'Big screen: HDMI and USB-C cables on the table.', 0),
  ('Ground floor', 'Bora', 4, array['screen', 'video'], '', 1),
  ('Ground floor', 'Cabin', 2, array['video', 'phone'], 'For calls: please keep it short.', 2)
) as r(floor, name, capacity, equipment, note, position)
join floors fl on fl.name = r.floor;

insert into areas (floor_id, name, preset, position)
select fl.id, a.name, a.preset, a.position from (values ('First floor', 'Open space', 'open_space', 0), ('Ground floor', 'Quiet zone', 'quiet_zone', 1)) as a(floor, name, preset, position)
join floors fl on fl.name = a.floor;

insert into desks (area_id, name, features, assigned_to, position)
select a.id, d.name, d.features, case when d.owner is null then null else 'mbr_' || rpad(d.owner, 26, 'a') end, d.position
from (values
  ('Open space', 'D-01', array['screen', 'dock', 'window'], null, 0),
  ('Open space', 'D-02', array['screen', 'dock', 'window'], null, 1),
  ('Open space', 'D-03', array['screen', 'dock'], null, 2),
  ('Open space', 'D-04', array['screen', 'dock'], null, 3),
  ('Open space', 'D-05', array['screen', 'standing'], null, 4),
  ('Open space', 'D-06', array['screen'], null, 5),
  ('Open space', 'D-07', array['window'], null, 6),
  ('Open space', 'D-08', array[]::text[], null, 7),
  ('Quiet zone', 'D-09', array['screen', 'quiet'], null, 8),
  ('Quiet zone', 'D-10', array['screen', 'quiet', 'window'], null, 9),
  ('Quiet zone', 'D-11', array['quiet'], null, 10),
  ('Quiet zone', 'D-12', array['screen', 'dock', 'quiet'], 'sofia', 11)
) as d(area, name, features, owner, position)
join areas a on a.name = d.area;

-- Where everyone is: day 0 is this Monday, 7 the next one.
insert into presence (member_id, day, status, office_id)
select 'mbr_' || rpad(p.who, 26, 'a'), date_trunc('week', current_date)::date + p.d, p.status, case when p.status = 'office' then (select id from offices limit 1) end
from (values
  ('camille', 0, 'office'), ('camille', 1, 'office'), ('camille', 2, 'remote'), ('camille', 3, 'office'), ('camille', 4, 'off'),
  ('camille', 7, 'office'), ('camille', 8, 'office'), ('camille', 9, 'remote'), ('camille', 10, 'remote'),
  ('ines', 0, 'remote'), ('ines', 1, 'office'), ('ines', 2, 'office'), ('ines', 3, 'office'), ('ines', 4, 'remote'),
  ('ines', 7, 'remote'), ('ines', 8, 'office'), ('ines', 10, 'office'),
  ('hugo', 0, 'office'), ('hugo', 1, 'remote'), ('hugo', 2, 'office'), ('hugo', 3, 'office'), ('hugo', 4, 'off'),
  ('hugo', 7, 'office'), ('hugo', 9, 'office'),
  ('lea', 0, 'remote'), ('lea', 1, 'remote'), ('lea', 2, 'office'), ('lea', 3, 'office'), ('lea', 4, 'office'),
  ('lea', 7, 'off'), ('lea', 8, 'off'), ('lea', 9, 'off'), ('lea', 10, 'office'),
  ('tom', 0, 'office'), ('tom', 1, 'office'), ('tom', 2, 'office'), ('tom', 3, 'office'), ('tom', 4, 'remote'),
  ('tom', 7, 'office'), ('tom', 8, 'office'), ('tom', 10, 'office'),
  ('sofia', 0, 'office'), ('sofia', 1, 'office'), ('sofia', 2, 'office'), ('sofia', 3, 'office'), ('sofia', 4, 'office'),
  ('sofia', 7, 'office'), ('sofia', 8, 'office'), ('sofia', 9, 'office'), ('sofia', 10, 'office')
) as p(who, d, status);

-- Their desks on office days (Sofia has her own, D-12; Inès books mornings on Wednesdays).
insert into desk_bookings (desk_id, member_id, day, part, during)
select dk.id, p.member_id, p.day, part,
  tstzrange((p.day + make_interval(mins => case part when 'pm' then 720 else 0 end))::timestamp at time zone 'Europe/Paris',
            (p.day + make_interval(mins => case part when 'am' then 720 else 1440 end))::timestamp at time zone 'Europe/Paris', '[)')
from presence p
join (values ('camille', 'D-01'), ('ines', 'D-05'), ('hugo', 'D-02'), ('lea', 'D-09'), ('tom', 'D-03')) as m(who, desk) on p.member_id = 'mbr_' || rpad(m.who, 26, 'a')
join desks dk on dk.name = m.desk
cross join lateral (select case when m.who = 'ines' and extract(isodow from p.day) = 3 then 'am' else 'day' end as part) x
where p.status = 'office';

-- Meetings, on the weekdays of both weeks.
with days as (
  select d::date as day, extract(isodow from d)::int as dow
  from generate_series(date_trunc('week', current_date)::date, date_trunc('week', current_date)::date + 11, interval '1 day') d
  where extract(isodow from d) <= 5
), plan(dow, room, s, e, who, title, guests) as (values
  (1, 'Atlas', 570, 600, 'camille', 'Team stand-up', array['ines', 'hugo', 'lea', 'tom', 'sofia']),
  (1, 'Bora', 840, 900, 'hugo', 'Pipeline review', array['ines']),
  (2, 'Atlas', 600, 690, 'ines', 'Client workshop — Maison Lenoir', array['hugo', 'camille']),
  (2, 'Cabin', 780, 810, 'tom', 'Call with the accountant', array[]::text[]),
  (2, 'Bora', 930, 990, 'sofia', 'Office supplies', array['camille']),
  (3, 'Bora', 540, 600, 'lea', 'Design review', array['tom']),
  (3, 'Atlas', 840, 960, 'tom', 'Sprint planning', array['lea', 'hugo']),
  (4, 'Atlas', 600, 660, 'camille', 'Budget 2027', array['sofia', 'ines']),
  (4, 'Cabin', 690, 720, 'hugo', '', array[]::text[]),
  (4, 'Bora', 870, 930, 'ines', 'Interview', array['camille']),
  (5, 'Atlas', 990, 1080, 'sofia', 'Friday drinks', array['camille', 'ines', 'hugo', 'lea', 'tom'])
), made as (
  insert into room_bookings (room_id, member_id, title, day, during)
  select r.id, 'mbr_' || rpad(p.who, 26, 'a'), p.title, d.day,
    tstzrange((d.day + make_interval(mins => p.s))::timestamp at time zone 'Europe/Paris', (d.day + make_interval(mins => p.e))::timestamp at time zone 'Europe/Paris', '[)')
  from days d join plan p on p.dow = d.dow join rooms r on r.name = p.room
  returning id, title, room_id
)
insert into room_attendees (booking_id, member_id)
select made.id, 'mbr_' || rpad(g, 26, 'a')
from made join plan p on p.title = made.title join rooms r on r.id = made.room_id and r.name = p.room cross join unnest(p.guests) g;

-- The stand-up is weekly.
select setval('room_series', 1);
update room_bookings set series = 1 where title = 'Team stand-up';

-- Visitors: the client workshop's guests on Tuesdays, a candidate for the
-- Thursday interview, and two visitors today (one already here).
insert into visits (office_id, day, at_minute, name, company, host, created_by, arrived_at, arrived_by)
select (select id from offices limit 1), v.day, v.at, v.name, v.company, 'mbr_' || rpad(v.host, 26, 'a'), 'mbr_' || rpad(v.by, 26, 'a'),
  case when v.here then now() - interval '20 minutes' end, case when v.here then 'mbr_' || rpad('sofia', 26, 'a') end
from (values
  (date_trunc('week', current_date)::date + 1, 600, 'Claire Lenoir', 'Maison Lenoir', 'ines', 'ines', false),
  (date_trunc('week', current_date)::date + 1, 600, 'Marc Aubert', 'Maison Lenoir', 'ines', 'sofia', false),
  (date_trunc('week', current_date)::date + 3, 870, 'Julie Fontaine', '', 'camille', 'camille', false),
  (date_trunc('week', current_date)::date + 8, 600, 'Claire Lenoir', 'Maison Lenoir', 'ines', 'ines', false),
  (current_date, 570, 'Nicolas Girard', 'Cabinet Girard', 'hugo', 'sofia', true),
  (current_date, 900, 'Emma Schmitt', 'Atelier Schmitt', 'camille', 'camille', false)
) as v(day, at, name, company, host, by, here)
where v.day >= current_date - 7;

-- Tom is in on Mondays to Thursdays, at D-03: his usual week (the tool
-- says the coming days for him when a page is read).
insert into usual_week (member_id, weekday, status)
select 'mbr_' || rpad('tom', 26, 'a'), w, 'office' from generate_series(1, 4) w;
insert into member_prefs (member_id, usual_desk) select 'mbr_' || rpad('tom', 26, 'a'), id from desks where name = 'D-03';

-- Everything above goes to the members' calendars (lib/calendar.ts).
insert into calendar_queue (key)
select 'room:' || id from room_bookings where cancelled_at is null and upper(during) > now() - interval '30 days'
on conflict do nothing;
insert into calendar_queue (key)
select distinct 'day:' || member_id || ':' || to_char(day, 'YYYY-MM-DD') from (
  select member_id, day from presence where status = 'office'
  union select member_id, day from desk_bookings where cancelled_at is null
) s
on conflict do nothing;
