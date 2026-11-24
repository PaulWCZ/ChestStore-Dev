-- Notes and the words of feedback are sealed by the Chest (SDK 0.7.0,
-- capability "sealed"): the stored text is `chest:sealed:1:…`, longer than
-- the words it holds. The bounds on what a person writes stay the tool's
-- (src/shared/model.ts: a note 5,000 characters, feedback 3,000); the
-- columns only bound what the Chest returns (a sealed value is 1 MiB at
-- most). This only widens: the previous version still writes and reads.
alter table notes drop constraint notes_body_check;
alter table notes add constraint notes_body_check check (char_length(body) between 1 and 1048576);
alter table feedback drop constraint feedback_strengths_check;
alter table feedback add constraint feedback_strengths_check check (char_length(strengths) <= 1048576);
alter table feedback drop constraint feedback_concerns_check;
alter table feedback add constraint feedback_concerns_check check (char_length(concerns) <= 1048576);
