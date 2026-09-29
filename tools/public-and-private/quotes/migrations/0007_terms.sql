-- The company's terms and conditions of sale (conditions générales de
-- vente, CGV): one PDF an administrator adds in Settings, kept in the
-- Chest's files with its SHA-256. It goes with every quote sent by email,
-- the client's page links it, and an answer given online keeps the
-- fingerprint of the terms it was given with. A replaced file is kept
-- (answers point to it by its fingerprint).
alter table company add column terms_object text;
alter table company add column terms_name text;
alter table company add column terms_sha256 text;
alter table company add column terms_size bigint;
alter table quote_answers add column terms_sha256 text;
