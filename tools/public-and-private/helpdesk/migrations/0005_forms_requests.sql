-- Requests from Forms (Proposal (studio): events between tools): an answer
-- to a form mapped to Support ("forms.request", version 1) opens a ticket.
-- Version 0.3 keeps working on this schema: every new column may be null,
-- and the tickets it writes still carry a customer's address.

-- A colleague's request (a team form): the member who asked, never their
-- name or address. 'erased' once their data was erased. Such a ticket has
-- no customer address ('').
alter table tickets add column requester text check (requester ~ '^mbr_[a-z2-7]{26}$' or requester = 'erased');
alter table tickets drop constraint tickets_customer_email_check;
alter table tickets add constraint tickets_customer_email_check check (char_length(customer_email) between 3 and 254 or (customer_email = '' and requester is not null));

-- 'forms': opened by an answer to a form of the Forms tool.
alter table tickets drop constraint tickets_channel_check;
alter table tickets add constraint tickets_channel_check check (channel in ('form', 'email', 'team', 'forms'));

-- Where it came from: {"form": {"id", "title"}, "answer": {"id", "path"}}
-- ("From the form “Contact us”", with a link back to the answer), and the
-- event that opened it: a delivery again (at least once) or the same
-- answer again opens nothing.
alter table tickets add column source jsonb;
alter table tickets add column source_event text unique check (char_length(source_event) between 1 and 100);
create unique index tickets_source_answer on tickets ((source -> 'form' ->> 'id'), (source -> 'answer' ->> 'id')) where source is not null;
create index tickets_requester on tickets (requester) where requester is not null;
