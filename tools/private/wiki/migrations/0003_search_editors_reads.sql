-- Finding "Wi-Fi" by "wifi", a word with a typo, who may edit a space,
-- editors who left without saying so, and pages people must confirm they
-- read. People are member ids (mbr_…) or group ids (grp_…); 'erased'
-- replaces the id of a person whose data was erased.

-- Search: words written with a hyphen, an apostrophe or a dot inside
-- ("Wi-Fi", "e-mail", "aujourd'hui") are also indexed joined ("wifi",
-- "email", "aujourdhui"), so a person finds them whichever way they type.
create function wiki_compounds(t text) returns text language sql immutable strict parallel safe as $$
  select coalesce(string_agg(regexp_replace(m[1], '[-‐‑''’.·]+', '', 'g'), ' '), '')
  from regexp_matches(t, '([^[:space:][:punct:]‐‑’·]+(?:[-‐‑''’.·]+[^[:space:][:punct:]‐‑’·]+)+)', 'g') as m
$$;
alter table pages drop column search;
alter table pages add column search tsvector generated always as (
  setweight(to_tsvector('wiki', title || ' ' || wiki_compounds(title)), 'A')
  || setweight(to_tsvector('wiki', body || ' ' || wiki_compounds(body)), 'B')) stored;
create index pages_search on pages using gin (search);

-- Every word the wiki holds (as search keeps them): a word typed with a
-- mistake is matched to the nearest one ("pasword" → "password"). Only
-- ever added to; a word no page holds any more finds nothing, which is
-- harmless, and never shows as such.
create table search_words (
  word text primary key check (char_length(word) between 3 and 60)
);
create index search_words_trgm on search_words using gin (word gin_trgm_ops);

create function wiki_keep_words() returns trigger language plpgsql as $$
begin
  insert into search_words (word)
    select distinct w from unnest(tsvector_to_array(new.search)) as w
    where char_length(w) between 3 and 60 and w !~ '^[0-9]+$'
  on conflict do nothing;
  return null;
end
$$;
create trigger pages_words after insert or update of title, body on pages
  for each row execute function wiki_keep_words();
insert into search_words (word)
  select distinct w from pages, unnest(tsvector_to_array(search)) as w
  where char_length(w) between 3 and 60 and w !~ '^[0-9]+$'
on conflict do nothing;

-- The edit lock: seen_at is the last sign that its holder's editor is
-- still open (it says so every 30 seconds); unheard of for two minutes, the
-- lock is free again. active_at stays the last time they typed.
alter table page_locks add column seen_at timestamptz not null default now();

-- Who may edit a space: every editor of the wiki ('editors'), or only some
-- of them ('some') — the groups and people of space_editors, with the
-- space's creator and the Chest's administrators. Readers stay readers.
alter table spaces add column editing text not null default 'editors' check (editing in ('editors', 'some'));
create table space_editors (
  space_id bigint not null references spaces (id) on delete cascade,
  who text not null check (who ~ '^(grp|mbr)_[a-z2-7]{26}$'),
  primary key (space_id, who)
);
create index space_editors_who on space_editors (who);
