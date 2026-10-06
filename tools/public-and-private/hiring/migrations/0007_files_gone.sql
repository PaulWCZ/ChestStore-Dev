-- Hiring, seventh step.
--
-- files_gone: a file of the tool's the Chest could not delete when its
-- candidate went (erasure, retention, a replaced CV): kept here and tried
-- again by the nightly cleanup until the Chest deletes it, so an erased CV
-- never survives silently.
-- form_counts and chest_events (0001): no longer written since 0006 (the
-- package's chest_bounds and chest_seen); dropped.
create table files_gone (
  object text primary key,
  tries integer not null default 0,
  since timestamptz not null default now()
);

drop table form_counts;
drop table chest_events;

-- The candidate may give back the time they chose (to choose another) or
-- call the interview off, from their link: two more kinds of history.
alter table activity drop constraint activity_kind_check;
alter table activity add constraint activity_kind_check check (kind in (
  'applied', 'added', 'moved', 'rejected', 'restored', 'note', 'feedback', 'asked', 'emailed', 'cv',
  'wrote', 'replied', 'interview', 'interview_moved', 'interview_cancelled', 'considered', 'imported', 'written_outside',
  'interview_link', 'interview_chosen', 'interview_link_cancelled', 'interview_rechosen', 'interview_declined'));
