-- "My pages": a private space for each member who wants one — meeting
-- notes, drafts, a to-do list — that only they see, readers included (they
-- write there and nowhere else). It is a space like the others, kept to
-- its creator (visibility 'private'): not the Chest's administrators, not
-- the wiki's editors; nobody is told about its pages; moving a page to a
-- space shares it. At most one per member.
--
-- The previous version keeps working on this schema: it never writes
-- 'private', and reads such a space as kept to groups (none: only its
-- creator and the administrators would see it).
alter table spaces drop constraint spaces_visibility_check;
alter table spaces add constraint spaces_visibility_check check (visibility in ('everyone', 'groups', 'private'));
create unique index spaces_private_owner on spaces (created_by) where visibility = 'private';
