-- Clients on SDK 0.7.0 (contract 0.7).
--
-- Who may see a line another tool told (SDK 0.7.0: an event's audience): a
-- booking is told for its host and Booking's admins. Null: everyone with a
-- role here (every line written by a person, every form's answer); else the
-- members of Clients the teller allows — the line, the meeting on My day,
-- the lead's meeting and the bell are theirs only.
alter table activities add column audience text[]
  check (audience is null or cardinality(audience) <= 5000);
alter table booked_meetings add column audience text[]
  check (audience is null or cardinality(audience) <= 5000);

-- The Chest has no currency any more: each deal keeps its own (deals.currency,
-- as before), and a new deal takes the team's default currency — a
-- manager's setting. EUR until one is chosen (what the Chest's was unless
-- its owner set another).
insert into settings (key, value) values ('currency', 'EUR') on conflict (key) do nothing;
