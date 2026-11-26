-- The welcome email to an arrival not in the Chest yet (lib/welcome.ts):
-- the Chest's message id and what the Chest last said of it (mail.status),
-- so a bounce shows on the checklist. Never the address: the arrival keeps
-- it, and forgets it once linked.
alter table journeys add column welcome_mail text check (welcome_mail is null or char_length(welcome_mail) between 1 and 200);
alter table journeys add column welcome_mail_status text check (welcome_mail_status is null or welcome_mail_status in ('queued', 'sent', 'delivered', 'bounced', 'complained', 'failed'));
