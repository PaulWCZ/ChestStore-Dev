import { notFound } from "next/navigation";
import { AutoRefresh } from "../../../../components/auto-refresh.tsx";
import { Avatar } from "@argentic/chest-ui/components";
import { Back, Calendar, Clip, Clock, Download, Globe, Group, History, Mail, Pin, Place } from "../../../../components/icons.tsx";
import { RichText } from "../../../../components/rich-text.tsx";
import { calendarPage } from "../../../../lib/agenda.ts";
import { can } from "../../../../lib/access.ts";
import { everyone, reach, tally } from "../../../../lib/audience.ts";
import { dates } from "../../../../lib/dates.ts";
import { db } from "../../../../lib/db.ts";
import { audienceLabel, groupNames } from "../../../../lib/groups.ts";
import { AppError } from "../../../../lib/errors.ts";
import { catalogue, format, isLocale, plural } from "../../../../lib/i18n/index.ts";
import { emojis, pick, pieces, type Version } from "../../../../lib/model.ts";
import { nameOf, people } from "../../../../lib/people.ts";
import { confirmations, post as readPost, revisions, touch, type PostDetail } from "../../../../lib/posts.ts";
import { viewer } from "../../../../lib/session.ts";
import { learned } from "../../../../lib/state.ts";
import { Kicker } from "../../story.tsx";
import { Comments, ConfirmBox, PostTools, Reactions, RemindButton, Rsvp, SendingNotice } from "./parts.tsx";

// One post, as an article: its headline, byline, picture, what it asks
// (confirm, answer), its text, pictures and files, reactions and comments.
// For its publishers: who confirmed an Important post, how far it reached
// (counts only), and its earlier versions.
export default async function PostPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const v = await viewer();
  if (!v) return null;
  const { member, locale, t, zone } = v;
  const { id } = await params;
  const query = await searchParams;
  const sql = db();
  let p: PostDetail;
  try {
    p = await readPost(sql, member, id, { zone });
  } catch (error) {
    if (error instanceof AppError) notFound();
    throw error;
  }
  await touch(sql, member.id);
  const now = new Date();
  const d = dates(locale, zone, now);
  const publisher = can(member, "publish");
  // The version shown: the reader's language (or the post's own), or the
  // one they asked for (?lang=).
  const asked = typeof query["lang"] === "string" && isLocale(query["lang"]) ? query["lang"] : null;
  const shown: Version = asked ? pick({ ...p.own, versions: p.versions }, asked) : { locale: p.locale, title: p.title, body: p.body };
  const languages = [p.own.locale, ...p.versions.map(x => x.locale)].filter(isLocale).filter(code => code !== shown.locale);
  const all = publisher && !p.scheduled ? await everyone() : null;
  const readers = all && p.important ? await readersOf(p, all) : null;
  const reached = all && !p.sending ? await reachOf(p, all) : null;
  const history = publisher && p.textVersion > 1 ? await revisions(sql, member, p.id) : [];
  const thread = p.thread;
  const mentioned = thread.flatMap(c => [...c.body.matchAll(/@\[(mbr_[a-z2-7]{26})\]/gu)].map(m => m[1]!));
  const ids = [p.author, ...(p.welcome ? [p.welcome] : []), ...thread.map(c => c.author), ...mentioned, ...p.answers.map(a => a.member), ...p.reactionList.flatMap(r => r.people), ...(readers?.confirmed.map(c => c.member) ?? []), ...history.map(h => h.editedBy)];
  const who = await people(ids);
  const name = (memberId: string) => (memberId === member.id ? t.people.you : nameOf(who.get(memberId), locale));
  const plainName = (memberId: string) => (memberId === member.id ? member.name : nameOf(who.get(memberId), locale));
  const photo = (memberId: string) => (memberId === member.id ? member.photo : who.get(memberId)?.photo ?? null);
  const audience = p.groups.length > 0 || p.people.length > 0 ? audienceLabel(p, await groupNames(), locale) : null;
  const going = p.answers.filter(a => a.answer === "yes");
  const notGoing = p.answers.filter(a => a.answer === "no");
  const waiting = p.answers.filter(a => a.answer === "wait");
  const inCalendar = p.rsvp === "yes" && (await learned(sql, "calendar")) === "on";
  const mail = await learned(sql, "mail");

  async function readersOf(post: PostDetail, list: Awaited<ReturnType<typeof everyone>>) {
    const found = await confirmations(sql, member, post.id);
    const counted = tally(post, found.confirmed, list.people);
    const pending = counted.pending.map(x => ({ id: x.id, name: x.name, photo: x.photo }));
    return { confirmed: counted.confirmed, pending, earlier: found.earlier.length, complete: list.complete, remindedAt: found.post.remindedAt };
  }
  async function reachOf(post: PostDetail, list: Awaited<ReturnType<typeof everyone>>) {
    const rows = await sql<{ member: string; at: Date }[]>`select member, at from activity`;
    return reach(post, list.people, new Map(rows.map(r => [r.member, r.at])));
  }

  return (
    <div className="article-page">
      <AutoRefresh seconds={30} />
      <a className="back" href="/chest"><Back />{t.post.back}</a>
      <article className="article" aria-labelledby="headline" lang={shown.locale}>
        <header className="article-head">
          <Kicker post={p} isNew={false} t={{ kinds: t.kinds, front: t.front, event: t.event }} />
          <h1 id="headline">{shown.title}</h1>
          <div className="byline-row" lang={locale}>
            <Avatar name={name(p.author)} photo={photo(p.author)} size="l" className="avatar-40" />
            <p className="byline">
              <strong>{format(t.front.by, { name: name(p.author) })}</strong>
              <span>
                <time dateTime={p.publishAt}>{format(t.post.published, { date: d.full(p.publishAt) })}</time>
                {p.editedAt && <span> · {t.post.edited}</span>}
              </span>
            </p>
            {publisher && !p.sending && <PostTools id={p.id} pinned={p.pinned} t={t.post} errors={t.errors} />}
          </div>
        </header>

        <div className="notices" lang={locale}>
          {p.sending && p.undoUntil && p.author === member.id && <SendingNotice id={p.id} until={p.undoUntil} t={t.post} errors={t.errors} />}
          {p.sending && p.author !== member.id && <p className="notice"><Clock />{t.post.goingOut}</p>}
          {p.scheduled && !p.sending && <p className="notice"><Clock />{format(t.post.scheduled, { date: d.full(p.publishAt) })}</p>}
          {audience && <p className="notice"><Group />{format(t.post.audience, { groups: audience })}</p>}
          {p.pinned && p.pinnedUntil && publisher && <p className="notice quiet"><Pin />{format(t.post.pinnedUntil, { date: d.date(new Date(new Date(p.pinnedUntil).getTime() - 60_000).toISOString()) })}</p>}
          {languages.length > 0 && (
            <p className="also-in"><Globe />{languages.map(code => <a key={code} href={`/chest/posts/${p.id}?lang=${code}`} lang={code} hrefLang={code}>{catalogue(code).post.readIn}</a>)}</p>
          )}
        </div>

        {p.cover && <figure className="cover"><img src={`/chest/files/${p.cover}?size=1024`} alt="" /></figure>}

        {p.welcome && (
          <div className="welcome-card" lang={locale}>
            <Avatar name={name(p.welcome)} photo={photo(p.welcome)} size="xl" className="avatar-96" />
            <p>{format(t.welcome.hello, { name: name(p.welcome) })}</p>
          </div>
        )}

        {p.event && (
          <section className="event-box" aria-label={t.kinds.event} lang={locale}>
            <dl>
              <div><dt><Calendar /><span className="visually-hidden">{t.event.when}</span></dt><dd>{d.days(p.event, t.event)}</dd></div>
              <div><dt><Clock /><span className="visually-hidden">{t.event.when}</span></dt><dd>{d.hours(p.event, t.event)}</dd></div>
              {p.event.place && <div><dt><Place /><span className="visually-hidden">{t.event.where}</span></dt><dd>{p.event.place}</dd></div>}
            </dl>
            {p.event.seats !== null && <p className="seats">{format(t.event.places, { taken: going.length, seats: p.event.seats })}{waiting.length > 0 ? " · " + plural(t.event.waitingCount, waiting.length, locale) : ""}</p>}
            <Rsvp id={p.id} answer={p.rsvp} open={p.eventOpen} full={p.event.seats !== null && going.length >= p.event.seats} t={t.event} errors={t.errors} />
            <p className="row">
              {inCalendar && <a className="link" href={calendarPage}><Calendar />{t.event.inCalendar}</a>}
              <a className="link" href={`/chest/posts/${p.id}/calendar`} download><Download />{t.event.calendar}</a>
            </p>
            <div className="attendees">
              <h2>{t.event.who}</h2>
              {p.answers.length === 0 ? <p className="quiet-text">{t.event.nobody}</p> : (
                <>
                  <p className="quiet-text">{[going.length ? plural(t.event.going, going.length, locale) : null, notGoing.length ? plural(t.event.notGoing, notGoing.length, locale) : null].filter(Boolean).join(" · ")}</p>
                  <ul className="people">
                    {going.map(a => <li key={a.member}><Avatar name={name(a.member)} photo={photo(a.member)} size="m" className="avatar-28" />{name(a.member)}</li>)}
                  </ul>
                  {waiting.length > 0 && (
                    <>
                      <h3 className="quiet-text">{t.event.waitingList}</h3>
                      <ol className="people waiting">
                        {waiting.map(a => <li key={a.member}><Avatar name={name(a.member)} photo={photo(a.member)} size="m" className="avatar-28" />{name(a.member)}</li>)}
                      </ol>
                    </>
                  )}
                </>
              )}
            </div>
          </section>
        )}

        {p.important && !p.scheduled && (p.forMe || p.author === member.id) && (
          <div lang={locale}>
            <ConfirmBox
              id={p.id}
              own={p.author === member.id}
              confirmed={p.confirmed}
              again={p.confirmedEarlier}
              when={p.confirmedAt ? format(t.important.confirmed, { date: d.full(p.confirmedAt) }) : null}
              t={t.important}
              errors={t.errors}
            />
          </div>
        )}

        <RichText text={shown.body} />

        {p.gallery.length > 0 && (
          <section className="gallery" aria-label={t.post.gallery} lang={locale}>
            {p.gallery.map((g, i) => g.type.startsWith("video/")
              ? <video key={g.id} controls preload="metadata" src={`/chest/files/${g.id}`} aria-label={format(t.post.video, { name: g.fileName })} />
              : <a key={g.id} href={`/chest/files/${g.id}?size=1024`} target="_blank" rel="noopener"><img src={`/chest/files/${g.id}?size=1024`} alt={format(t.post.picture, { n: i + 1, count: p.gallery.length })} loading="lazy" /></a>)}
          </section>
        )}

        {p.attachments.length > 0 && (
          <section className="attachments" aria-labelledby="files-title" lang={locale}>
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
          <div lang={locale}>
            <Reactions
              id={p.id}
              list={p.reactionList.map(r => ({ emoji: r.emoji, symbol: emojis[r.emoji], count: r.count, mine: r.mine, names: r.people.slice(0, 12).map(name) }))}
              t={t.reactions}
              errors={t.errors}
              locale={locale}
            />
          </div>
        )}
      </article>

      {readers && (
        <section className="readers" aria-labelledby="readers-title">
          <h2 id="readers-title">{format(t.readers.title, { done: readers.confirmed.length, total: readers.confirmed.length + readers.pending.length })}</h2>
          <div className="meter" aria-hidden="true"><span style={{ width: `${readers.confirmed.length + readers.pending.length === 0 ? 0 : Math.round((100 * readers.confirmed.length) / (readers.confirmed.length + readers.pending.length))}%` }} /></div>
          <div className="readers-lists">
            <div>
              <h3>{t.readers.pending}</h3>
              {readers.pending.length === 0 ? <p className="quiet-text">{t.readers.all}</p> : <ul className="people">{readers.pending.map(m => <li key={m.id}><Avatar name={m.name} photo={m.photo} size="m" className="avatar-28" />{m.name}</li>)}</ul>}
            </div>
            <div>
              <h3>{t.readers.confirmed}</h3>
              {readers.confirmed.length === 0 ? <p className="quiet-text">{t.readers.none}</p> : <ul className="people">{readers.confirmed.map(c => <li key={c.member}><Avatar name={name(c.member)} photo={photo(c.member)} size="m" className="avatar-28" /><span>{name(c.member)}</span><time className="quiet-text" dateTime={c.at}>{d.short(c.at)}</time></li>)}</ul>}
            </div>
          </div>
          {readers.earlier > 0 && <p className="quiet-text">{plural(t.readers.earlier, readers.earlier, locale)}</p>}
          {!readers.complete && <p className="quiet-text">{t.readers.incomplete}</p>}
          <div className="row">
            {readers.pending.length > 0 && <RemindButton id={p.id} t={t.readers} errors={t.errors} locale={locale} />}
            <a className="button quiet small" href={`/chest/posts/${p.id}/confirmations`} download><Download />{t.readers.download}</a>
          </div>
          <p className="fine">{t.readers.privacy}</p>
        </section>
      )}

      {reached && (
        <section className="reach" aria-labelledby="reach-title">
          <h2 id="reach-title">{t.reach.title}</h2>
          <p className="reach-figure"><strong>{reached.total === 0 ? "—" : `${Math.round((100 * reached.came) / reached.total)} %`}</strong><span>{format(t.reach.came, { came: reached.came, total: reached.total })}</span></p>
          {p.important && (
            <p className="quiet-text"><Mail />{mail === "off" && p.emailed === 0 ? t.reach.emailOff : plural(t.reach.emailed, p.emailed, locale)}{p.emailShort ? " " + t.reach.emailShort : ""}</p>
          )}
          <p className="fine">{t.reach.privacy}</p>
        </section>
      )}

      {history.length > 0 && (
        <details className="history">
          <summary><History />{plural(t.history.title, history.length, locale)}</summary>
          <ol>
            {history.map(h => (
              <li key={h.version + ":" + h.replacedAt}>
                <p className="quiet-text">{format(t.history.replaced, { version: h.version, date: d.full(h.replacedAt), name: plainName(h.editedBy) })}</p>
                <h3 lang={h.locale}>{h.title}</h3>
                <RichText text={h.body} className="prose small" />
              </li>
            ))}
          </ol>
        </details>
      )}

      {!p.scheduled && (
        <Comments
          id={p.id}
          thread={thread.map(c => ({
            id: c.id, parentId: c.parentId, author: name(c.author), photo: photo(c.author), mine: c.author === member.id, when: d.ago(c.at), date: d.full(c.at),
            raw: c.body, pieces: pieces(c.body, plainName), names: Object.fromEntries([...c.body.matchAll(/@\[(mbr_[a-z2-7]{26})\]/gu)].map(m => [m[1]!, plainName(m[1]!)])), edited: c.edited,
          }))}
          canModerate={can(member, "moderate")}
          me={{ name: member.name, photo: member.photo }}
          t={t.comments}
          errors={t.errors}
          locale={locale}
          you={t.people.you}
        />
      )}
    </div>
  );
}
