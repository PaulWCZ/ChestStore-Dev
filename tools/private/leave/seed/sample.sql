-- Sample data for local runs and screenshots (never run by the Chest): a
-- company of seven (the studio's cast, lab/chest-dev/cast.mjs) that moved
-- from a spreadsheet at the start of the leave year. Dates follow today, so
-- this month and the next always have leave in them.
--   camille (HR), ines (manager of hugo), lea (manager of tom),
--   hugo, tom, sofia, nora (employees; sofia and nora answered by HR).

-- The cost of a span in jours ouvrés (Monday to Friday, French public
-- holidays excluded), for this file only: the tool counts with lib/calendar.ts.
create function pg_temp.easter(y int) returns date language plpgsql as $$
declare a int; b int; c int; d int; e int; f int; g int; h int; i int; k int; l int; m int;
begin
  a := y % 19; b := y / 100; c := y % 100; d := b / 4; e := b % 4; f := (b + 8) / 25; g := (b - f + 1) / 3;
  h := (19 * a + b - d - g + 15) % 30; i := c / 4; k := c % 4; l := (32 + 2 * e + 2 * i - h - k) % 7; m := (a + 11 * h + 22 * l) / 451;
  return make_date(y, (h + l - 7 * m + 114) / 31, ((h + l - 7 * m + 114) % 31) + 1);
end $$;

create function pg_temp.holiday(d date) returns boolean language sql as $$
  select to_char(d, 'MM-DD') in ('01-01', '05-01', '05-08', '07-14', '08-15', '11-01', '11-11', '12-25')
      or d in (pg_temp.easter(extract(year from d)::int) + 1, pg_temp.easter(extract(year from d)::int) + 39, pg_temp.easter(extract(year from d)::int) + 50)
$$;

create function pg_temp.cost(s date, sh text, e date, eh text) returns numeric language sql as $$
  select coalesce(sum(case when extract(isodow from d) < 6 and not pg_temp.holiday(d::date)
    then 1 - (case when d::date = s and sh = 'pm' then 0.5 else 0 end) - (case when d::date = e and eh = 'am' then 0.5 else 0 end) else 0 end), 0)
  from generate_series(s, e, interval '1 day') d
$$;

-- The first working day on or after a day.
create function pg_temp.workday(d date) returns date language plpgsql as $$
declare x date := d;
begin
  while extract(isodow from x) > 5 or pg_temp.holiday(x) loop x := x + 1; end loop;
  return x;
end $$;

do $$
declare
  camille text := 'mbr_camilleaaaaaaaaaaaaaaaaaaa';
  ines text := 'mbr_inesaaaaaaaaaaaaaaaaaaaaaa';
  hugo text := 'mbr_hugoaaaaaaaaaaaaaaaaaaaaaa';
  lea text := 'mbr_leaaaaaaaaaaaaaaaaaaaaaaaa';
  tom text := 'mbr_tomaaaaaaaaaaaaaaaaaaaaaaa';
  sofia text := 'mbr_sofiaaaaaaaaaaaaaaaaaaaaaa';
  nora text := 'mbr_noraaaaaaaaaaaaaaaaaaaaaaa';
  paid bigint; rtt bigint; sick bigint; unpaid bigint; remote bigint;
  today date := (now() at time zone 'Europe/Paris')::date;
  month_start date := date_trunc('month', (now() at time zone 'Europe/Paris'))::date;
  next_month date := (date_trunc('month', (now() at time zone 'Europe/Paris')) + interval '1 month')::date;
  week date := date_trunc('week', (now() at time zone 'Europe/Paris'))::date;
  period date;
  r record;
  k bigint;
begin
  select id into paid from leave_types where key = 'paid';
  select id into rtt from leave_types where key = 'rtt';
  select id into sick from leave_types where key = 'sick';
  select id into unpaid from leave_types where key = 'unpaid';
  select id into remote from leave_types where key = 'remote';
  period := case when extract(month from today) >= 6 then make_date(extract(year from today)::int, 6, 1) else make_date(extract(year from today)::int - 1, 6, 1) end;

  -- The rules were chosen (HR's first run is done).
  update settings set updated_at = now() - interval '120 days', updated_by = camille;

  -- Approvers, start dates, employee numbers; Tom works four days a week
  -- (not on Fridays).
  insert into staff (member_id, approver_id, start_date, employee_number, work_days) values
    (camille, null, '2019-03-04', '0001', null), (ines, null, '2021-09-06', '0007', null), (lea, null, '2022-04-01', '0012', null),
    (hugo, ines, '2024-01-15', '0015', null), (tom, lea, '2025-11-03', '0019', '{1,2,3,4}'), (sofia, null, '2023-06-12', '0021', null), (nora, null, '2026-02-02', '0024', null);

  -- Opening balances, from the spreadsheet, at the start of the leave year
  -- (what was left to take: acquired); RTT for the year.
  insert into ledger (member_id, type_id, kind, days, on_date, reason, created_by) values
    (camille, paid, 'opening', 14.5, period, 'Opening balance (spreadsheet)', camille),
    (ines, paid, 'opening', 9, period, 'Opening balance (spreadsheet)', camille),
    (lea, paid, 'opening', 11.5, period, 'Opening balance (spreadsheet)', camille),
    (hugo, paid, 'opening', 6, period, 'Opening balance (spreadsheet)', camille),
    (tom, paid, 'opening', 12.5, period, 'Opening balance (spreadsheet)', camille),
    (sofia, paid, 'opening', 7.5, period, 'Opening balance (spreadsheet)', camille),
    (nora, paid, 'opening', 8.5, period, 'Opening balance (spreadsheet)', camille);
  insert into ledger (member_id, type_id, kind, days, on_date, reason, created_by)
    select m, rtt, 'adjustment', 10, make_date(extract(year from today)::int, 1, 1), 'RTT for the year', camille from unnest(array[camille, ines, lea, hugo, tom, sofia, nora]) m;

  -- The requests: who, kind, first day, half, last day, half, status, who
  -- answered, note, reason, asked how long ago.
  for r in select * from (values
    (camille, paid, pg_temp.workday((month_start - interval '1 month')::date + 10), 'am', pg_temp.workday((month_start - interval '1 month')::date + 10) + 2, 'pm', 'approved', 'self', null, null, 40),
    (tom, paid, date_trunc('week', month_start + 7)::date, 'am', date_trunc('week', month_start + 7)::date + 4, 'pm', 'approved', lea, 'Climbing in the Calanques', null, 45),
    (ines, rtt, pg_temp.workday(month_start + 15), 'am', pg_temp.workday(month_start + 15), 'pm', 'approved', camille, null, null, 35),
    (nora, paid, pg_temp.workday(month_start + 10), 'pm', pg_temp.workday(month_start + 10) + 1, 'pm', 'approved', camille, null, null, 33),
    (camille, rtt, pg_temp.workday(month_start + 18), 'am', pg_temp.workday(month_start + 18), 'am', 'approved', 'self', null, null, 30),
    (hugo, paid, week + 14, 'am', week + 18, 'pm', 'approved', ines, 'Family trip to Porto', 'Enjoy!', 20),
    (ines, paid, pg_temp.workday(week + 9), 'pm', pg_temp.workday(week + 9), 'pm', 'approved', camille, null, null, 12),
    (lea, paid, week + 3, 'am', week + 4, 'pm', 'approved', camille, null, null, 25),
    (sofia, sick, week + 1, 'am', week + 2, 'pm', 'approved', 'chest', null, null, 5),
    (tom, rtt, pg_temp.workday(week + 8), 'am', pg_temp.workday(week + 8), 'pm', 'pending', null, 'Moving flat', null, 3),
    (tom, paid, pg_temp.workday(date_trunc('week', month_start + 14)::date + 1), 'am', pg_temp.workday(date_trunc('week', month_start + 14)::date + 1), 'pm', 'refused', lea, null, 'Release day, sorry — any other day that week is fine', 30),
    (lea, paid, date_trunc('week', next_month + 7)::date, 'am', date_trunc('week', next_month + 7)::date + 2, 'pm', 'pending', null, null, null, 4),
    (hugo, paid, date_trunc('week', next_month + 7)::date + 3, 'am', date_trunc('week', next_month + 7)::date + 4, 'pm', 'pending', null, 'My cousin''s wedding in Nantes', null, 1),
    (nora, paid, date_trunc('week', next_month + 14)::date, 'am', date_trunc('week', next_month + 14)::date + 4, 'pm', 'approved', camille, null, null, 15),
    (ines, unpaid, pg_temp.workday(date_trunc('week', next_month + 21)::date), 'am', pg_temp.workday(date_trunc('week', next_month + 21)::date), 'am', 'pending', null, 'School meeting', null, 0),
    (sofia, remote, pg_temp.workday(week + 10), 'am', pg_temp.workday(week + 10), 'pm', 'approved', 'chest', null, null, 2)
  ) as t(who, kind, s, sh, e, eh, status, by_whom, note, reason, ago)
  loop
    insert into requests (member_id, type_id, start_date, start_half, end_date, end_half, days, note, status, decided_by, decided_at, reason, created_at)
    values (r.who, r.kind, r.s, r.sh, r.e, r.eh, case when r.kind = sick then (r.e - r.s + 1) else pg_temp.cost(r.s, r.sh, r.e, r.eh) end, r.note, r.status,
      case when r.by_whom = 'self' then camille else r.by_whom end,
      case when r.status = 'pending' then null else now() - make_interval(days => greatest(r.ago - 1, 0)) end,
      r.reason, now() - make_interval(days => r.ago, hours => 2))
    returning id into k;
    insert into request_events (request_id, actor, kind, at) values (k, r.who, case when r.kind in (sick, remote) then 'declared' else 'asked' end, now() - make_interval(days => r.ago, hours => 2));
    if r.status in ('approved', 'refused') and r.kind not in (sick, remote) then
      insert into request_events (request_id, actor, kind, reason, at) values (k, case when r.by_whom = 'self' then camille else r.by_whom end, r.status, r.reason, now() - make_interval(days => greatest(r.ago - 1, 0)));
    end if;
    if r.status = 'approved' and r.kind in (paid, rtt) then
      insert into ledger (member_id, type_id, kind, days, on_date, request_id, created_by)
      select member_id, type_id, 'taken', -days, start_date, id, decided_by from requests where id = k;
    end if;
  end loop;
end $$;
