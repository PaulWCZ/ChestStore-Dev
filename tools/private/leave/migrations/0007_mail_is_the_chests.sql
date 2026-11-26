-- Leave sends no email any more (the owner's decision of 6 October 2026):
-- the Chest mails each member their notifications, by their own choice in
-- the Chest. The per-person "email me" switch goes.
alter table staff drop column if exists email_off;
