-- Views per post, as an anonymous count (README, "Works council").
--
-- Replaces the reach of 0003 ("opened News since it was published"),
-- which read like a post's reach but counted visits to any page: the
-- activity table goes.
--
-- A view is one line per post and viewer, but the viewer is not stored:
-- only a fingerprint, a keyed hash (HMAC-SHA-256, cut to 128 bits) of
-- their member id under a key of that post alone, so a second visit is
-- not counted twice. The hour is kept, not the time: a publisher sees the
-- count as of the last full hour, so it cannot be watched rise when one
-- person opens the post. Thirty days after publication the count is kept
-- (views_kept), and the key and every fingerprint are deleted: after
-- that, nothing links a person to a post.
drop table activity;

alter table posts add column view_key text check (view_key is null or view_key ~ '^[0-9a-f]{64}$');
alter table posts add column views_kept integer check (views_kept is null or views_kept >= 0);

create table post_views (
  post_id bigint not null references posts (id) on delete cascade,
  fingerprint text not null check (fingerprint ~ '^[0-9a-f]{32}$'),
  hour timestamptz not null,
  primary key (post_id, fingerprint)
);
