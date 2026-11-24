-- Who may hear a job's changes live (SDK 0.7.0's realtime, chest.json's
-- "realtime"): one channel per job, "job:<id>", where the Chest feeds the
-- job's own rows, its stages, its candidates and what is written about
-- them. Before, one channel "team" was joined by every interviewer and fed
-- the ids of every job's rows: an interviewer learnt when candidates of
-- jobs they are not on applied, moved, were noted or interviewed.
--
-- 1. The tables written about a candidate carry their job (job_id), as the
--    feeds need it on the row: set from the candidate before each insert
--    (a candidate never changes jobs), filled for the rows already there.
--    messages.job_id stays null for an email not filed to a candidate.
-- 2. job_live: who may join "job:<id>" (the channel's "join"). The Chest
--    checks it at every join, on Hiring's database, without Hiring. A row
--    is written when Hiring shows a job to a member it has just checked
--    may see it — a recruiter every job, an interviewer the jobs they are
--    on —; it goes whenever that may no longer be true — taken off the
--    job, their role changed, they lost access, left or were erased —, and
--    the Chest takes them out of the channel at once. Their page reads
--    itself again: still allowed, it is let in again (a new row).
alter table notes add column job_id bigint references jobs (id) on delete cascade;
alter table feedback add column job_id bigint references jobs (id) on delete cascade;
alter table messages add column job_id bigint references jobs (id) on delete cascade;
alter table interviews add column job_id bigint references jobs (id) on delete cascade;
alter table interview_requests add column job_id bigint references jobs (id) on delete cascade;

update notes x set job_id = c.job_id from candidates c where c.id = x.candidate_id;
update feedback x set job_id = c.job_id from candidates c where c.id = x.candidate_id;
update messages x set job_id = c.job_id from candidates c where c.id = x.candidate_id;
update interviews x set job_id = c.job_id from candidates c where c.id = x.candidate_id;
update interview_requests x set job_id = c.job_id from candidates c where c.id = x.candidate_id;

create function hiring_job_of_candidate() returns trigger language plpgsql as $$
begin
  if new.candidate_id is null then
    new.job_id := null;
  else
    select job_id into new.job_id from candidates where id = new.candidate_id;
  end if;
  return new;
end
$$;

create trigger notes_job before insert or update of candidate_id on notes for each row execute function hiring_job_of_candidate();
create trigger feedback_job before insert or update of candidate_id on feedback for each row execute function hiring_job_of_candidate();
create trigger messages_job before insert or update of candidate_id on messages for each row execute function hiring_job_of_candidate();
create trigger interviews_job before insert or update of candidate_id on interviews for each row execute function hiring_job_of_candidate();
create trigger interview_requests_job before insert or update of candidate_id on interview_requests for each row execute function hiring_job_of_candidate();

create table job_live (
  job_id bigint not null references jobs (id) on delete cascade,
  member_id text not null check (member_id ~ '^mbr_[a-z2-7]{26}$'),
  since timestamptz not null default clock_timestamp(),
  primary key (job_id, member_id)
);
create index job_live_member on job_live (member_id);

-- How many times a member was taken out (a row of job_live went): a page's
-- version holds it, so a page whose reader was taken out is read again —
-- never a 304 — and lets them in again with a new mark. (The rows
-- themselves are not in the version: letting a reader in changes nothing
-- they see.) Forgotten with the member at their erasure.
create table live_out (
  member_id text primary key check (member_id ~ '^mbr_[a-z2-7]{26}$'),
  n bigint not null default 1
);
create function hiring_live_out() returns trigger language plpgsql as $$
begin
  insert into live_out (member_id) values (old.member_id) on conflict (member_id) do update set n = live_out.n + 1;
  return null;
end
$$;
create trigger job_live_out after delete on job_live for each row execute function hiring_live_out();
