-- A client's name as a match reads it — no case, no accents, no
-- punctuation, one space between words ("Boulangerie  DUPAIN S.A.S." and
-- "boulangerie dupain s a s" are one) — kept and indexed, so a hand-off
-- from Timesheets finds its client by name without reading every client
-- (src/lib/timesheets.ts). The Latin letters with accents are folded by
-- translate(), before lower(): the same in any database collation.
alter table clients add column name_key text generated always as (
  btrim(regexp_replace(lower(translate(name, 'àáâãäåāăąçćčďèéêëēėęěìíîïīįñńňòóôõöōőŕřśšşťùúûüūůűųýÿžźżÀÁÂÃÄÅĀĂĄÇĆČĎÈÉÊËĒĖĘĚÌÍÎÏĪĮÑŃŇÒÓÔÕÖŌŐŔŘŚŠŞŤÙÚÛÜŪŮŰŲÝŸŽŹŻ', 'aaaaaaaaacccdeeeeeeeeiiiiiinnnooooooorrssstuuuuuuuuyyzzzaaaaaaaaacccdeeeeeeeeiiiiiinnnooooooorrssstuuuuuuuuyyzzz')), '[^a-z0-9]+', ' ', 'g'))
) stored;
create index clients_by_name_key on clients (name_key) where archived_at is null;
