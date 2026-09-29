-- Search by the stem of a word, in French and English: "rembourser" finds
-- "remboursé" and "remboursement", "reimbursed" finds "reimburse". Beside
-- the exact words of 0001/0003 (the `wiki` configuration: `simple` +
-- `unaccent`), each page also keeps its words stemmed both ways, accents
-- aside.
--
-- The two configurations and the `stems` column follow News's
-- migrations/0003_reach.sql (same studio, MIT, © 2026 Argentic: news_en /
-- news_fr, copied here as wiki_en / wiki_fr; one tool, one folder).
--
-- The previous version keeps working on this schema: the column is
-- generated, nothing else changes.
create text search configuration wiki_en (copy = english);
alter text search configuration wiki_en alter mapping for hword, hword_part, word with unaccent, english_stem;
create text search configuration wiki_fr (copy = french);
alter text search configuration wiki_fr alter mapping for hword, hword_part, word with unaccent, french_stem;
alter table pages add column stems tsvector generated always as (
  setweight(to_tsvector('wiki_en', title) || to_tsvector('wiki_fr', title), 'A')
  || setweight(to_tsvector('wiki_en', body) || to_tsvector('wiki_fr', body), 'B')) stored;
create index pages_stems on pages using gin (stems);

-- "Nouvel arrivant" is how a French handbook says "new starter": added to
-- the starting group of onboarding words, unless the wiki's editors
-- changed that group already (their list is theirs).
update synonyms set words = words || array['nouvel arrivant', 'nouveaux arrivants', 'new starter']
  where words = array['livret d’accueil', 'accueil', 'arrivée', 'onboarding', 'handbook', 'welcome'];
