-- 0007's page version is taken back: its counter was one row that every
-- write updated (a statement trigger on 11 tables), so a big import piled
-- up versions of that row (quadratic: 5,000 rows took minutes) and every
-- other write waited for the import to end. The pages carry no version
-- until the studio's package gives one that is right (a change log read
-- in the page's own snapshot): a refresh renders the page again.
drop trigger if exists stages_book_version on stages;
drop trigger if exists companies_book_version on companies;
drop trigger if exists contacts_book_version on contacts;
drop trigger if exists deals_book_version on deals;
drop trigger if exists activities_book_version on activities;
drop trigger if exists steps_book_version on steps;
drop trigger if exists fields_book_version on fields;
drop trigger if exists imports_book_version on imports;
drop trigger if exists attachments_book_version on attachments;
drop trigger if exists booked_meetings_book_version on booked_meetings;
drop trigger if exists tool_state_book_version on tool_state;
drop function if exists crm_book_changed();
drop table if exists book_version;


-- The team's settings a manager chooses (one row per setting): who may
-- download the lists ("export": managers, managers and sales, everyone).
create table settings (
  key text primary key,
  value text not null
);
insert into settings (key, value) values ('export', 'sales');
