-- Privacy for members (critique round 3): who holds a key, a badge or a car
-- is security information, not a "who has the projector?" question.
-- Each category says whether members (not managers) see who holds its
-- items. The keys and badges and the vehicles start hidden, in existing
-- Chests too; every other category keeps showing its holders, as before.
-- A member always sees their own items. (Serial numbers are hidden from
-- members in the code, except on their own items: no column needed.)
alter table categories add column members_see boolean not null default true;
update categories set members_see = false where key in ('key', 'vehicle');
