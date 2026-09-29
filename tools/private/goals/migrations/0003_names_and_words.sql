-- A cycle named by the tool ("Q1 2027", "Aug – Nov 2026") is shown in each
-- reader's language, from its dates (lib/cycle-names.ts); `name` keeps the
-- words it was created with. A cycle an admin named keeps its own words.
alter table cycles add column generated boolean not null default false;
