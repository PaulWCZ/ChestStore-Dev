-- Card statement words (after the third critique): a company card payment
-- that becomes a draft (lib/cards.ts) gets the category its bank label
-- suggests, instead of "Other". A rule is one or a few words, matched as
-- whole words in the label, accents and case aside ("UBER" in
-- "UBER *TRIP PARIS"); the longest rule found wins ("UBER EATS" over
-- "UBER"). The accountant edits the list (Settings → Company → Card
-- statement words); a rule goes with its category.
create table card_rules (
  id bigint generated always as identity primary key,
  words text not null unique check (char_length(words) between 2 and 40 and words = upper(words)),
  category_id bigint not null references categories (id) on delete cascade,
  created_at timestamptz not null default now()
);

-- A small starting list of labels common on French card statements, for
-- the built-in categories that exist (renamed or not).
insert into card_rules (words, category_id)
select v.words, c.id from (values
  ('UBER', 'travel'), ('BOLT', 'travel'), ('HEETCH', 'travel'), ('G7', 'travel'), ('TAXI', 'travel'),
  ('SNCF', 'travel'), ('OUIGO', 'travel'), ('TRAINLINE', 'travel'), ('EUROSTAR', 'travel'), ('RATP', 'travel'), ('NAVIGO', 'travel'),
  ('AIR FRANCE', 'travel'), ('EASYJET', 'travel'), ('RYANAIR', 'travel'), ('TRANSAVIA', 'travel'), ('VOLOTEA', 'travel'),
  ('BLABLACAR', 'travel'), ('HERTZ', 'travel'), ('EUROPCAR', 'travel'), ('SIXT', 'travel'), ('AVIS', 'travel'), ('LIME', 'travel'),
  ('TOTAL', 'fuel'), ('TOTALENERGIES', 'fuel'), ('ESSO', 'fuel'), ('SHELL', 'fuel'), ('BP', 'fuel'), ('AVIA', 'fuel'), ('CARBURANT', 'fuel'),
  ('INDIGO', 'parking'), ('SAEMES', 'parking'), ('EFFIA', 'parking'), ('ONEPARK', 'parking'), ('ZENPARK', 'parking'), ('PARKING', 'parking'),
  ('PEAGE', 'parking'), ('SANEF', 'parking'), ('APRR', 'parking'), ('COFIROUTE', 'parking'), ('VINCI AUTOROUTES', 'parking'), ('ULYS', 'parking'),
  ('HOTEL', 'lodging'), ('IBIS', 'lodging'), ('NOVOTEL', 'lodging'), ('MERCURE', 'lodging'), ('CAMPANILE', 'lodging'), ('KYRIAD', 'lodging'),
  ('B B HOTELS', 'lodging'), ('AIRBNB', 'lodging'), ('BOOKING COM', 'lodging'),
  ('RESTAURANT', 'meals'), ('BRASSERIE', 'meals'), ('BISTROT', 'meals'), ('CAFE', 'meals'), ('BOULANGERIE', 'meals'), ('TRAITEUR', 'meals'),
  ('UBER EATS', 'meals'), ('DELIVEROO', 'meals'), ('JUST EAT', 'meals'), ('STARBUCKS', 'meals'),
  ('AMAZON', 'supplies'), ('FNAC', 'supplies'), ('DARTY', 'supplies'), ('BOULANGER', 'supplies'), ('BUREAU VALLEE', 'supplies'),
  ('OFFICE DEPOT', 'supplies'), ('LDLC', 'supplies'), ('IKEA', 'supplies'), ('LEROY MERLIN', 'supplies')
) as v (words, key) join categories c on c.key = v.key
on conflict (words) do nothing;
