-- The client book's version: a number that grows with every change of
-- what the pages show (any insert, update or delete of these tables, one
-- step per statement). A page's refresh with nothing new is then answered
-- "unchanged" (304) without being rendered (src/lib/version.ts).
create table book_version (
  id int primary key check (id = 1),
  n bigint not null
);
insert into book_version (id, n) values (1, 0);

create function crm_book_changed() returns trigger language plpgsql as $$
begin
  update book_version set n = n + 1 where id = 1;
  return null;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array['stages', 'companies', 'contacts', 'deals', 'activities', 'steps', 'fields', 'imports', 'attachments', 'booked_meetings', 'tool_state'] loop
    execute format('create trigger %I after insert or update or delete or truncate on %I for each statement execute function crm_book_changed()', t || '_book_version', t);
  end loop;
end;
$$;
