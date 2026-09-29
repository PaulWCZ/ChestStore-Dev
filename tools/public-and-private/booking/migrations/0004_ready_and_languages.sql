-- A host is published only once they said their times are right, and a
-- host's texts in two languages. Earlier versions keep working: new
-- columns with defaults.

-- ready: the host connected a calendar or confirmed their hours. Until
-- then their page is not public: not on the company page, not bookable
-- (lib/booking.ts publicHost, publicType, listedHosts, a team's hosts).
alter table hosts add column ready boolean not null default false;
-- Hosts made before this version were public already: those who did
-- anything with their page stay public (a calendar, a booking, a block,
-- a day off, a welcome, hours of their own); a host who only opened the
-- tool once is not published any more until they confirm.
update hosts h set ready = true
where exists (select 1 from calendars c where c.member_id = h.member_id)
   or exists (select 1 from bookings b where b.member_id = h.member_id)
   or exists (select 1 from blocks k where k.member_id = h.member_id)
   or exists (select 1 from overrides o where o.member_id = h.member_id)
   or h.welcome <> ''
   or h.weekly <> '[[], [[540, 750], [840, 1050]], [[540, 750], [840, 1050]], [[540, 750], [840, 1050]], [[540, 750], [840, 1050]], [[540, 750], [840, 1050]], []]'::jsonb;

-- language: the language the host writes their texts in (welcome, types,
-- questions); null: not said yet (the page then follows the visitor).
-- second_language: another version of those texts, optional; a visitor
-- who reads neither gets the first. welcome_alt: the welcome sentence in
-- the second language.
alter table hosts add column language text check (language ~ '^[a-z]{2}$');
alter table hosts add column second_language text check (second_language is null or (second_language ~ '^[a-z]{2}$' and language is not null and second_language <> language));
alter table hosts add column welcome_alt text not null default '' check (char_length(welcome_alt) <= 300);

-- A type's texts in the host's second language, keyed by what they
-- translate: "title", "description", "<question id>", "<question id>.<n>"
-- (the n-th choice). Checked by lib/texts.ts; an empty text falls back to
-- the first language.
alter table types add column alt jsonb not null default '{}'::jsonb check (jsonb_typeof(alt) = 'object');
