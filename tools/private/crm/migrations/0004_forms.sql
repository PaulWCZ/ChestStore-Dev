-- Clients receives what Forms tells (Proposal (studio): events between
-- tools): `forms.contact`, someone who filled in a form and left an email
-- or a phone (lib/from-forms.ts). It becomes a line of the contact's
-- history, of a new kind, 'form': the form's title and the answer's
-- references in `data`, the respondent's message in `body`.
-- The previous version keeps working on this schema: nothing it reads was
-- removed, only a kind added.

alter table activities drop constraint activities_kind_check;
alter table activities add constraint activities_kind_check check (kind in ('call', 'meeting', 'email', 'note', 'step', 'created', 'stage', 'won', 'lost', 'reopened', 'owner', 'unassigned', 'merged', 'form'));

-- One line per event, whatever happens: delivered again (at least once),
-- or two deliveries at the same moment, the second fails here and is
-- delivered again later, to find the first.
create unique index activities_form_event on activities ((data->>'event')) where kind = 'form';
-- An answer published again under another event id finds its line too.
create index activities_form_answer on activities ((data->>'answer')) where kind = 'form';
