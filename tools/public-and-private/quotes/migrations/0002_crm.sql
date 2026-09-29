-- The link Clients (CRM) → Quotes (Proposal (studio): events between tools).
-- A deal won in Clients becomes a draft quote here, once per deal; the
-- deal's reference, its title, the moment the draft was made (to know it
-- was never touched), and whether the deal was reopened since.
alter table documents add column crm_deal text;
alter table documents add column crm_title text;
alter table documents add column crm_made_at timestamptz;
alter table documents add column crm_reopened_at timestamptz;
create unique index documents_by_crm_deal on documents (crm_deal) where crm_deal is not null;
