-- Support tells the tools an admin linked to it (Goals: "Tickets solved")
-- when a ticket is solved or reopened: helpdesk.ticket.solved {ticket,
-- assignee} and helpdesk.ticket.reopened {ticket} (Proposal (studio):
-- events between tools). A trigger writes each one in the same
-- transaction as the change, whatever made it — a reply that closes, the
-- status menu, a bulk action and its Undo, the customer writing again —;
-- lib/ticket-events.ts publishes them after, and the "late" schedule again
-- while the Chest cannot take them.
--
-- Solved: a ticket that was open or waiting is closed (a duplicate closed
-- by a merge is not solved). Reopened: a solved ticket leaves "closed"
-- (reopened, or marked as spam: either takes the solved one back).

create table ticket_events (
  id bigint generated always as identity primary key,
  type text not null check (type in ('helpdesk.ticket.solved', 'helpdesk.ticket.reopened')),
  ticket integer not null,
  -- The ticket's agent when it was solved (mbr_…), or null.
  assignee text check (assignee ~ '^mbr_[a-z2-7]{26}$'),
  at timestamptz not null default clock_timestamp(),
  published_at timestamptz
);
create index ticket_events_pending on ticket_events (id) where published_at is null;

create function ticket_solved_or_reopened() returns trigger language plpgsql as $$
begin
  if new.status = 'closed' and old.status in ('open', 'waiting') and new.merged_into is null then
    insert into ticket_events (type, ticket, assignee)
    values ('helpdesk.ticket.solved', new.number, case when new.assignee ~ '^mbr_[a-z2-7]{26}$' then new.assignee end);
  elsif old.status = 'closed' and new.status <> 'closed' and old.merged_into is null then
    insert into ticket_events (type, ticket) values ('helpdesk.ticket.reopened', new.number);
  end if;
  return new;
end
$$;

create trigger tickets_solved_or_reopened after update of status on tickets
  for each row execute function ticket_solved_or_reopened();
