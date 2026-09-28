-- Days off told by the Leave tool (Proposal (studio): events between
-- tools): the presence it set carries the leave it came from, so a
-- cancelled leave takes back exactly those days.
alter table presence add column leave_ref text check (leave_ref is null or leave_ref ~ '^[A-Za-z0-9._:-]{1,80}$');
create index presence_leave on presence (leave_ref) where leave_ref is not null;
