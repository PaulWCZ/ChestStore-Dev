-- Where an answer goes besides Forms, as the form's author maps it: a
-- contact in Clients, a ticket in Support (lib/routes.ts; events
-- forms.contact and forms.request). {"contact": {"name": "<question id>",
-- …} | null, "request": {…} | null}. Earlier versions keep working: {} is
-- "nowhere". Never for an anonymous form (its answers name no one).
alter table forms add column routes jsonb not null default '{}'::jsonb check (jsonb_typeof(routes) = 'object');
alter table forms add constraint anonymous_no_routes check (not anonymous or (coalesce(routes->'contact', 'null'::jsonb) = 'null'::jsonb and coalesce(routes->'request', 'null'::jsonb) = 'null'::jsonb));
