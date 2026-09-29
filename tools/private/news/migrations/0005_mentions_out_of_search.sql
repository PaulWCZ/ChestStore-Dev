-- A comment's mentions are not words of it.
--
-- A comment stores a mention as @[mbr_…] (or @[erased] once the person
-- is erased) and shows it as "@Name". The search index of 0002 and the
-- stems of 0003 read the stored text, so "mbr", "erased" or a piece of a
-- member id found the comment, and its post, although neither shows those
-- words. The index now reads the comment with each mention taken out
-- (the same pattern as `mentionToken` in lib/model.ts). Names are not
-- stored (they come from the Chest), so a mention is not found by the
-- person's name either: the passage shown still writes it.
--
-- Generated columns cannot be changed in place: they are dropped and
-- added again, which recomputes every row (a reindex), with their indexes.
alter table comments drop column search;
alter table comments drop column stems;

alter table comments add column search tsvector
  generated always as (to_tsvector('news', regexp_replace(body, '@\[(mbr_[a-z2-7]{26}|erased)\]', ' ', 'g'))) stored;
create index comments_search on comments using gin (search);

alter table comments add column stems tsvector
  generated always as (
    to_tsvector('news_en', regexp_replace(body, '@\[(mbr_[a-z2-7]{26}|erased)\]', ' ', 'g'))
    || to_tsvector('news_fr', regexp_replace(body, '@\[(mbr_[a-z2-7]{26}|erased)\]', ' ', 'g'))
  ) stored;
create index comments_stems on comments using gin (stems);
