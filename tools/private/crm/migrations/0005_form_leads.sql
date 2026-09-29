-- Form answers, round 3 (lib/from-forms.ts, lib/leads.ts).
--
-- A form answer is filed on a known contact only when it is surely them:
-- the same email, or the same phone AND the same name. Otherwise a new
-- contact is made and marked as maybe the same person as the one it looks
-- like (`maybe_same`), for someone to merge or keep apart. The answer's
-- line of history carries what the form gave (`data.who`: name, email,
-- phone, company), so nobody's message is ever hidden in another's file.
alter table contacts add column maybe_same bigint references contacts (id) on delete set null;
alter table contacts add constraint contacts_maybe_same_not_self check (maybe_same is null or maybe_same <> id);

-- Leads: a contact a form made, nobody's yet, waits in My day until
-- someone takes it, is given it, or says it is not a lead.
alter table contacts add column lead_since timestamptz;
create index contacts_leads on contacts (lead_since) where lead_since is not null;

-- The contacts forms already made (0004) and nobody took are leads.
update contacts c set lead_since = c.created_at
where c.owner is null and c.created_by = 'chest'
  and exists (select 1 from activities a where a.contact_id = c.id and a.kind = 'created' and a.data ? 'form');

-- The previous version keeps working on this schema: two columns added,
-- both empty for what it writes.
