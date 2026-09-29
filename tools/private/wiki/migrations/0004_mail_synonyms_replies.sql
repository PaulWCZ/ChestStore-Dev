-- Reminders to those who have not confirmed a page, words that mean the
-- same thing for search, replies and comments on a passage (with
-- "resolved"), and the bell items a deleted comment takes back.
--
-- The previous version keeps working on this schema: every column added is
-- optional or has a default; the tables are new.

-- "Read and acknowledged": when those who have not confirmed were last
-- reminded (by an editor, or a week after the ask by the "reviews"
-- schedule), and how many times (the schedule reminds twice at most).
alter table pages add column read_reminded_at timestamptz;
alter table pages add column read_reminders smallint not null default 0;

-- Words that mean the same thing, for search: one group per line
-- ("congés, vacances, holidays"). A search for one also finds the others.
-- Editors change them (Search → "Words that mean the same"). The wiki
-- starts with the office words below, French and English.
create table synonyms (
  id bigint generated always as identity primary key,
  words text[] not null check (cardinality(words) between 2 and 12),
  updated_by text not null default 'chest',
  updated_at timestamptz not null default now()
);
insert into synonyms (words) values
  (array['congés', 'congé', 'vacances', 'holidays', 'holiday', 'time off', 'leave']),
  (array['télétravail', 'tt', 'remote', 'work from home', 'wfh']),
  (array['notes de frais', 'note de frais', 'frais', 'remboursement', 'remboursements', 'expenses', 'expense', 'expense report']),
  (array['mot de passe', 'mots de passe', 'password', 'passwords']),
  (array['wifi', 'internet', 'réseau', 'network']),
  (array['code porte', 'digicode', 'door code', 'badge', 'badges']),
  (array['arrêt maladie', 'maladie', 'sick leave', 'sick day', 'sick days']),
  (array['salaire', 'paie', 'fiche de paie', 'bulletin de paie', 'payslip', 'payroll', 'salary']),
  (array['mutuelle', 'health insurance']),
  (array['imprimante', 'imprimantes', 'printer', 'printers']),
  (array['ordinateur', 'ordinateur portable', 'laptop', 'computer', 'pc']),
  (array['réunion', 'réunions', 'meeting', 'meetings']),
  (array['formation', 'formations', 'training']),
  (array['livret d’accueil', 'accueil', 'arrivée', 'onboarding', 'handbook', 'welcome']),
  (array['déménagement', 'move', 'moving']),
  (array['tickets restaurant', 'titres restaurant', 'déjeuner', 'cantine', 'meal vouchers', 'lunch']),
  (array['parking', 'stationnement', 'car park']),
  (array['horaires', 'heures d’ouverture', 'opening hours', 'office hours']),
  (array['entretien annuel', 'entretiens annuels', 'annual review', 'performance review']),
  (array['sécurité', 'safety', 'security']),
  (array['transport', 'navigo', 'commute', 'travel pass']),
  (array['facture', 'factures', 'invoice', 'invoices']),
  (array['client', 'clients', 'customer', 'customers']),
  (array['règlement intérieur', 'internal rules', 'house rules']),
  (array['démission', 'départ', 'resignation', 'leaving']),
  (array['urgence', 'urgences', 'emergency']),
  (array['cuisine', 'kitchen']),
  (array['clés', 'clé', 'keys', 'key']),
  (array['déplacement', 'voyage', 'business trip', 'travel']),
  (array['bureau', 'bureaux', 'office', 'offices']);

-- Comments: a reply belongs to a comment at the top of the page (one
-- level); a comment may quote the passage it is about (chosen on the
-- page); a conversation is resolved (folded, reopened at will).
alter table page_comments add column parent_id bigint references page_comments (id) on delete cascade;
alter table page_comments add column quote text check (quote is null or char_length(quote) between 1 and 300);
alter table page_comments add column resolved_at timestamptz;
alter table page_comments add column resolved_by text;
create index page_comments_parent on page_comments (parent_id) where parent_id is not null;

-- Which comment each person's comment or mention item in the bell shows
-- (one item per page and reason: a new comment replaces it). A comment
-- deleted takes its items back; brought back with Undo, or edited, they
-- show its words again.
create table comment_notices (
  page_id bigint not null references pages (id) on delete cascade,
  member_id text not null check (member_id ~ '^mbr_[a-z2-7]{26}$'),
  reason text not null check (reason in ('comments', 'mention')),
  comment_id bigint not null references page_comments (id) on delete cascade,
  primary key (page_id, member_id, reason)
);
create index comment_notices_comment on comment_notices (comment_id);
