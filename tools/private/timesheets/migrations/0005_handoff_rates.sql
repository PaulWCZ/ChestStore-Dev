-- An entry handed over to Quotes carries its rates from that moment (the
-- invoice and Timesheets' amounts never drift apart). handoff_fixed: the
-- rates were written by the hand-off — taken back, they are forgotten
-- again; invoiced, they stay for good (rates_fixed).
alter table entries add column handoff_fixed boolean not null default false;

-- Hand-offs already waiting: their rates as they are in force now.
update entries e set handoff_fixed = true, rates_fixed = true,
  bill_rate_cents = bill_rate(e.member_id, e.project_id, e.day),
  cost_rate_cents = cost_rate(e.member_id, e.day)
where e.handoff_id is not null and e.invoiced_at is null and not e.rates_fixed;
