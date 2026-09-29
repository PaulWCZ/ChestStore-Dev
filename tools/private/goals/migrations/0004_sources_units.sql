-- Goals, fourth step: key results fed by more of the store's tools, and
-- units read in the language they were written in.

-- Key results fed by other tools' events (lib/sources.ts), beside the
-- CRM's: cards done in Tasks, tickets solved in Support, hires in Hiring.
-- source_mine: count only what names the key result's owner (the card's
-- assignees, the ticket's assignee, who hired). source_scope: a board of
-- Tasks (its reference), or every board (null).
alter table key_results drop constraint key_results_source_check;
alter table key_results add constraint key_results_source_check check (source in ('crm.won_amount', 'crm.won_count', 'tasks.done', 'helpdesk.solved', 'hiring.hired'));
alter table key_results add column source_mine boolean not null default false;
alter table key_results add column source_scope text check (char_length(source_scope) between 1 and 64);
alter table key_results add constraint scope_is_tasks check (source_scope is null or source = 'tasks.done');

-- What the other tools told, kept as little as a count needs: the thing's
-- reference in its tool, the members it names (ids only), the board it is
-- on (Tasks, with the board's name to offer it in the form), and when it
-- happened — null once undone (a card reopened, a ticket reopened, a hire
-- cancelled). Never a title, a customer's words or a candidate's name.
create table fed_events (
  kind text not null check (kind in ('tasks.card', 'helpdesk.ticket', 'hiring.hire')),
  ref text not null check (ref ~ '^[A-Za-z0-9._:-]{1,64}$'),
  members text[] not null default '{}' check (cardinality(members) <= 20),
  scope text check (char_length(scope) between 1 and 64),
  scope_name text check (char_length(scope_name) between 1 and 80),
  at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (kind, ref)
);
create index fed_events_at on fed_events (kind, at) where at is not null;
create index fed_events_members on fed_events using gin (members);

-- A number's unit is words in the language of whoever wrote it
-- ("customer/customers", "client/clients"): the form for one follows that
-- language's rule (English: 1; French: 0 and 1), whoever reads it. Null
-- for units written before this step: the form for one is used for 1
-- only, the rule both languages share.
alter table key_results add column unit_locale text check (unit_locale ~ '^[a-z]{2}$');
