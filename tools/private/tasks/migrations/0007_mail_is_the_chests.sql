-- Tasks sends no email any more (the owner's decision of 6 October 2026):
-- the Chest mails each member their notifications, by their own choice in
-- the Chest. The emails waiting to leave and the per-person "email me"
-- switch go; the morning reminder's own switch (reminders.off) stays.
drop table if exists mail_queue;
alter table reminders drop column if exists email_off;
