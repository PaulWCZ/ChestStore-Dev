-- The directory's CSV carries HR's private extra fields (a medical visit…):
-- each download is written in the journal, as the register's is.
alter table journal drop constraint journal_action_check;
alter table journal add constraint journal_action_check check (action in (
  'viewed', 'created', 'changed', 'linked', 'document_added', 'document_opened', 'document_removed', 'register_viewed', 'register_exported', 'profile_changed',
  'imported', 'change_asked', 'change_accepted', 'change_declined', 'letter_printed', 'directory_exported'));
