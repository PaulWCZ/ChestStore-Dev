-- Where each answer went besides Forms (lib/respond.ts): the events the
-- Chest took for it ('forms.contact' → Clients, 'forms.request' →
-- Support) and 'webhooks' when a web address was sent it, and 'copy' when
-- the respondent's copy was mailed. The answer's page says so. Earlier
-- answers: '{}' (not known).
alter table answers add column sent text[] not null default '{}' check (cardinality(sent) <= 8);

-- Web addresses a form's editors gave (Proposal (studio): webhooks): a
-- Slack or Teams channel, or any receiver (Zapier, Make, a sheet's script:
-- "generic", JSON signed by the Chest). The Chest keeps the address
-- (encrypted); the tool keeps its id, what the Chest shows of it, and
-- whether the Chest stopped it (webhook.disabled).
create table form_hooks (
  id text primary key check (id ~ '^whk_[a-z0-9]{26}$'),
  form_id bigint not null references forms on delete cascade,
  kind text not null check (kind in ('slack', 'teams', 'generic')),
  label text not null default '' check (char_length(label) <= 80),
  shown text not null check (char_length(shown) <= 300),
  created_by text not null,
  created_at timestamptz not null default now(),
  disabled_at timestamptz,
  last_error text check (char_length(last_error) <= 200)
);
create index form_hooks_form on form_hooks (form_id);
