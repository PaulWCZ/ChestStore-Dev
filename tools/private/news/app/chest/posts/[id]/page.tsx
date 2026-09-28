import { notFound } from "next/navigation";
import { AutoRefresh } from "../../../../components/auto-refresh.tsx";
import { Avatar } from "../../../../components/avatar.tsx";
import { Back, Calendar, Clip, Clock, Download, Group, Place } from "../../../../components/icons.tsx";
import { RichText } from "../../../../components/rich-text.tsx";
import { can } from "../../../../lib/access.ts";
import { everyone, tally } from "../../../../lib/audience.ts";
import { dates } from "../../../../lib/dates.ts";
import { db } from "../../../../lib/db.ts";
import { audienceLabel, groupNames } from "../../../../lib/groups.ts";
import { AppError } from "../../../../lib/errors.ts";
import { format, plural } from "../../../../lib/i18n/index.ts";
import { emojis } from "../../../../lib/model.ts";
import { nameOf, people } from "../../../../lib/people.ts";
import { confirmations, post as readPost, type PostDetail } from "../../../../lib/posts.ts";
import { viewer } from "../../../../lib/session.ts";
import { Kicker } from "../../story.tsx";
import { Comments, ConfirmBox, PostTools, Reactions, RemindButton, Rsvp } from "./parts.tsx";

// One post, as an article: its headline, byline, picture, what it asks
// (confirm, answer), its text and files, reactions and comments. For its
// publishers, who confirmed an Important post.
export default async function PostPage({ params }: { params: Promise<{ id: string }> }) {
  const v = await viewer();
  if (!v) return null;
  const { member, locale, t, zone } = v;
  const { id } = await params;
  const sql = db();
  let p: PostDetail;
  try {
    p = await readPost(sql, member, id, { zone });
  } catch (error) {
    if (error instanceof AppError) notFound();
    throw error;
  }
  const now = new Date();
  const d = dates(locale, zone, now);
  const publisher = can(member, "publish");
  const readers = publisher && p.important && !p.scheduled ? await readersOf(p) : null;
  const ids = [p.author, ...(p.welcome ? [p.welcome] : []), ...p.thread.map(c => c.author), ...p.answers.map(a => a.member), ...p.reactionList.flatMap(r => r.people), ...(readers?.confirmed.map(c => c.member) ?? [])];
  const who = await people(ids);
  const name = (memberId: string) => (memberId === member.id ? t.people.you : nameOf(who.get(memberId), locale));
  const photo = (memberId: string) => (memberId === member.id ? member.photo : who.get(memberId)?.photo ?? null);
  const audience = p.groups.length > 0 ? audienceLabel(p.groups, await groupNames(), locale) : null;
  const going = p.answers.filter(a => a.answer === "yes");
  const notGoing = p.answers.filter(a => a.answer === "no");

  async function readersOf(post: PostDetail) {
    const list = await confirmations(sql, member, post.id);
    const all = await everyone();
    const counted = tally(post, list.confirmed, all.people);
    const pending = counted.pending.map(x => ({ id: x.id, name: x.name, photo: x.photo }));
    return { confirmed: counted.confirmed, pending, complete: all.complete, remindedAt: list.post.remindedAt };
  }

  return (
    <main className="article-page">
      <AutoRefresh seconds={30} />
      <a className="back" href="/chest"><Back />{t.post.back}</a>
      <article className="article" aria-labelledby="headline">
        <header className="article-head">
          <Kicker post={p} isNew={false} t={{ kinds: t.kinds, front: t.front, event: t.event }} />
          <h1 id="headline">{p.title}</h1>
          <div className="byline-row">
            <Avatar name={name(p.author)} photo={photo(p.author)} size={40} />
            <p className="byline">
              <strong>{format(t.front.by, { name: name(p.author) })}</strong>
              <span>
                <time dateTime={p.publishAt}>{format(t.post.published, { date: d.full(p.publishAt) })}</time>
                {p.editedAt && <span> · {t.post.edited}</span>}
              </span>
            </p>
            {publisher && <PostTools id={p.id} pinned={p.pinned} t={t.post} errors={t.errors} />}
          </div>
        </header>

        {p.scheduled && <p className="notice"><Clock />{format(t.post.scheduled, { date: d.full(p.publishAt) })}</p>}
        {audience && <p className="notice"><Group />{format(t.post.audience, { groups: audience })}</p>}

        {p.cover && <figure className="cover"><img src={`/chest/files/${p.cover}?size=1024`} alt="" /></figure>}

        {p.welcome && (
          <div className="welcome-card">
            <Avatar name={name(p.welcome)} photo={photo(p.welcome)} size={112} />
            <p>{format(t.welcome.hello, { name: name(p.welcome) })}</p>
          </div>
        )}

        {p.event && (
          <section className="event-box" aria-label={t.kinds.event}>
            <dl>
              <div><dt><Calendar /><span className="visually-hidden">{t.event.when}</span></dt><dd>{d.dayLong(p.event.day)}</dd></div>
              <div><dt><Clock /><span className="visually-hidden">{t.event.when}</span></dt><dd>{d.hours(p.event, t.event)}</dd></div>
              {p.event.place && <div><dt><Place /><span className="visually-hidden">{t.event.where}</span></dt><dd>{p.event.place}</dd></div>}
            </dl>
            <Rsvp id={p.id} answer={p.rsvp} open={p.eventOpen} t={t.event} errors={t.errors} />
            <a className="link" href={`/chest/posts/${p.id}/calendar`} download><Download />{t.event.calendar}</a>
            <div className="attendees">
              <h2>{t.event.who}</h2>
              {p.answers.length === 0 ? <p className="quiet-text">{t.event.nobody}</p> : (
                <>
                  <p className="quiet-text">{[going.length ? plural(t.event.going, going.length, locale) : null, notGoing.length ? plural(t.event.notGoing, notGoing.length, locale) : null].filter(Boolean).join(" · ")}</p>
                  <ul className="people">
                    {going.map(a => <li key={a.member}><Avatar name={name(a.member)} photo={photo(a.member)} size={28} />{name(a.member)}</li>)}
                  </ul>
                </>
              )}
            </div>
          </section>
        )}

        {p.important && !p.scheduled && (p.forMe || p.author === member.id) && (
          <ConfirmBox
            id={p.id}
            own={p.author === member.id}
            confirmed={p.confirmed}
            when={p.confirmedAt ? format(t.important.confirmed, { date: d.full(p.confirmedAt) }) : null}
            t={t.important}
            errors={t.errors}
          />
        )}

        <RichText text={p.body} />

        {p.attachments.length > 0 && (
          <section className="attachments" aria-labelledby="files-title">
            <h2 id="files-title">{t.post.attachments}</h2>
            <ul>
              {p.attachments.map(f => (
                <li key={f.id}>
                  <Clip />
                  <a href={`/chest/files/${f.id}`} target="_blank" rel="noopener">{f.fileName}</a>
                  <a className="icon-button" href={`/chest/files/${f.id}?download=1`}><Download /><span className="visually-hidden">{format(t.post.download, { name: f.fileName })}</span></a>
                </li>
              ))}
            </ul>
          </section>
        )}

        {!p.scheduled && (
          <Reactions
            id={p.id}
            list={p.reactionList.map(r => ({ emoji: r.emoji, symbol: emojis[r.emoji], count: r.count, mine: r.mine, names: r.people.slice(0, 12).map(name) }))}
            t={t.reactions}
            errors={t.errors}
            locale={locale}
          />
        )}
      </article>

      {readers && (
        <section className="readers" aria-labelledby="readers-title">
          <h2 id="readers-title">{format(t.readers.title, { done: readers.confirmed.length, total: readers.confirmed.length + readers.pending.length })}</h2>
          <div className="meter" aria-hidden="true"><span style={{ width: `${readers.confirmed.length + readers.pending.length === 0 ? 0 : Math.round((100 * readers.confirmed.length) / (readers.confirmed.length + readers.pending.length))}%` }} /></div>
          <div className="readers-lists">
            <div>
              <h3>{t.readers.pending}</h3>
              {readers.pending.length === 0 ? <p className="quiet-text">{t.readers.all}</p> : <ul className="people">{readers.pending.map(m => <li key={m.id}><Avatar name={m.name} photo={m.photo} size={28} />{m.name}</li>)}</ul>}
            </div>
            <div>
              <h3>{t.readers.confirmed}</h3>
              {readers.confirmed.length === 0 ? <p className="quiet-text">{t.readers.none}</p> : <ul className="people">{readers.confirmed.map(c => <li key={c.member}><Avatar name={name(c.member)} photo={photo(c.member)} size={28} /><span>{name(c.member)}</span><time className="quiet-text" dateTime={c.at}>{d.short(c.at)}</time></li>)}</ul>}
            </div>
          </div>
          {!readers.complete && <p className="quiet-text">{t.readers.incomplete}</p>}
          <div className="row">
            {readers.pending.length > 0 && <RemindButton id={p.id} t={t.readers} errors={t.errors} locale={locale} />}
            <a className="button quiet small" href={`/chest/posts/${p.id}/confirmations`} download><Download />{t.readers.download}</a>
          </div>
          <p className="fine">{t.readers.privacy}</p>
        </section>
      )}

      {!p.scheduled && (
        <Comments
          id={p.id}
          thread={p.thread.map(c => ({ id: c.id, author: name(c.author), photo: photo(c.author), mine: c.author === member.id, when: d.ago(c.at), date: d.full(c.at), body: c.body, edited: c.edited }))}
          canModerate={can(member, "moderate")}
          me={{ name: member.name, photo: member.photo }}
          t={t.comments}
          errors={t.errors}
          locale={locale}
          you={t.people.you}
        />
      )}
    </main>
  );
}
