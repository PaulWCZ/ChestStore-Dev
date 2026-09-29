import { Avatar } from "@argentic/chest-ui/components";
import { Calendar, Clock, Group, Pin, Place, kindIcons } from "../../components/icons.tsx";
import type { Dates } from "../../lib/dates.ts";
import { format, plural } from "../../lib/i18n/format.ts";
import type { Catalogue, Locale } from "../../lib/i18n/index.ts";
import type { PostSummary } from "../../lib/posts.ts";

// A story on the front page: the lead (large, its picture first) or one of
// the others. Its headline is the link; the whole card answers the click
// (a stretched link), the rest is text.
export type Byline = { name: string; photo: string | null };
export type StoryWords = Pick<Catalogue, "kinds" | "front" | "event">;

// audience: the groups it is kept to, in words (null: everyone).
export function Kicker({ post, isNew, audience = null, t }: { post: PostSummary; isNew: boolean; audience?: string | null; t: StoryWords }) {
  const Icon = kindIcons[post.kind];
  return (
    <p className="kicker">
      <span className="kind"><Icon />{t.kinds[post.kind]}</span>
      {post.pinned && <span className="flag"><Pin />{t.front.pinned}</span>}
      {post.important && (post.confirmed ? <span className="flag ok">{t.front.confirmed}</span> : <span className="flag alert">{t.front.important}</span>)}
      {isNew && <span className="flag new">{t.front.new}</span>}
      {audience && <span className="flag audience"><Group />{format(t.front.audience, { groups: audience })}</span>}
    </p>
  );
}

export function EventLine({ post, d, t }: { post: PostSummary; d: Dates; t: StoryWords }) {
  if (!post.event) return null;
  return (
    <p className="event-line">
      <span><Calendar />{d.days(post.event, t.event)}</span>
      <span><Clock />{d.hours(post.event, t.event)}</span>
      {post.event.place && <span><Place />{post.event.place}</span>}
    </p>
  );
}

export function Story({ post, lead = false, author, welcome, isNew, audience = null, d, locale, t }: { post: PostSummary; lead?: boolean; author: Byline; welcome: Byline | null; isNew: boolean; audience?: string | null; d: Dates; locale: Locale; t: StoryWords }) {
  const Heading = lead ? "h2" : "h3";
  // A welcome without a cover shows the colleague's photo beside the
  // headline, not as a picture: a large block of initials would lead the page.
  const picture = post.cover ? <img className="story-cover" src={`/chest/files/${post.cover}?size=1024`} alt="" loading={lead ? "eager" : "lazy"} /> : null;
  const counts = [
    post.comments > 0 ? plural(t.front.comments, post.comments, locale) : null,
    post.reactions > 0 ? plural(t.front.reactions, post.reactions, locale) : null,
    post.kind === "event" && post.going > 0 ? plural(t.front.going, post.going, locale) : null,
  ].filter(Boolean);
  return (
    <article className={"story" + (lead ? " lead" : "") + (picture ? " has-picture" : "") + (post.important && !post.confirmed ? " asks" : "")}>
      {picture && <div className="story-picture">{picture}</div>}
      <div className="story-text">
        <Kicker post={post} isNew={isNew} audience={audience} t={t} />
        {welcome && !post.cover && <p className="welcome-line"><Avatar name={welcome.name} photo={welcome.photo} size={lead ? "xl" : "l"}{...(lead ? {} : { className: "avatar-48" })} /><span>{welcome.name}</span></p>}
        <Heading className="headline"><a href={`/chest/posts/${post.id}`} className="stretched">{post.title}</a></Heading>
        <EventLine post={post} d={d} t={t} />
        {post.excerpt && <p className="dek">{post.excerpt}</p>}
        <p className="byline">
          <span>{format(t.front.by, { name: author.name })}</span>
          <time dateTime={post.publishAt} title={d.full(post.publishAt)}>{d.ago(post.publishAt)}</time>
          {counts.map(c => <span key={c}>{c}</span>)}
        </p>
      </div>
    </article>
  );
}
