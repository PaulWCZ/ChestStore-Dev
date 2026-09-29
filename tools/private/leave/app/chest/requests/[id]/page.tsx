import Link from "next/link";
import { notFound } from "next/navigation";
import { Avatar } from "../../../../components/avatar.tsx";
import { Back } from "../../../../components/icons.tsx";
import { AppError } from "../../../../lib/app-error.ts";
import { balancesOf } from "../../../../lib/balances.ts";
import { db } from "../../../../lib/db.ts";
import { format, formatDate, formatDays, plural, spanText } from "../../../../lib/i18n/index.ts";
import { today } from "../../../../lib/model.ts";
import { nameOf, people } from "../../../../lib/people.ts";
import { afterRequest } from "../../../../lib/left.ts";
import { history, pendingOf, request, undoMinutes, type Seen, type Step } from "../../../../lib/requests.ts";
import { leaveType } from "../../../../lib/rules.ts";
import { viewer } from "../../../../lib/session.ts";
import { typeName } from "../../../../lib/type-name.ts";
import { RequestActions } from "./request-actions.tsx";

// One request: who, what, when, what it costs, its answer and what
// happened — and the actions the viewer may take. The bell links here.
export default async function RequestPage({ params }: { params: Promise<{ id: string }> }) {
  const v = await viewer();
  if (!v) return null;
  const { member, locale, t } = v;
  const sql = db();
  let r: Seen;
  let steps: Step[];
  try {
    r = await request(sql, member, (await params).id);
    steps = await history(sql, member, r.id);
  } catch (error) {
    if (error instanceof AppError) notFound();
    throw error;
  }
  const ty = await leaveType(sql, r.typeId);
  const who = await people([r.memberId, ...steps.map(s => s.actor)]);
  const person = who.get(r.memberId);
  const b = r.sight !== "own" && r.status === "pending" ? (await balancesOf(sql, [r.memberId])).get(r.memberId)?.find(x => x.typeId === r.typeId) : undefined;
  const after = b && b.setUp ? afterRequest(b.left, (await pendingOf(sql, [r.memberId])).filter(o => o.typeId === r.typeId), r).after : null;
  const status = r.cancelAsked ? "cancelAsked" : r.status === "approved" && r.decidedBy === "chest" ? "declared" : r.status;
  const actorName = (id: string) => (id === "chest" ? t.people.chest : id === member.id ? t.people.you : nameOf(who.get(id), locale));
  const recent = r.decidedBy === member.id && r.decidedAt !== null && Date.now() - Date.parse(r.decidedAt) < undoMinutes * 60000;
  return (
    <main className="page narrow">
      <Link className="back" href={r.sight === "own" ? "/chest" : "/chest/approvals"}><Back />{r.sight === "own" ? t.shell.home : t.shell.approvals}</Link>
      <article className="detail">
        <header className="detail-head">
          <Avatar name={person?.name ?? ""} photo={person?.photo ?? null} size={48} />
          <div>
            <p className="muted small">{t.request.title}</p>
            <h1>{r.sight === "own" ? t.people.you : nameOf(person, locale)}</h1>
          </div>
          <span className={`status s-${status}`}>{t.status[status]}</span>
        </header>
        <dl className="facts">
          <div><dt>{t.request.what}</dt><dd><span className={`kind k-${ty.color}`}>{typeName(ty, t.types)}</span>{r.event ? <span className="muted"> · {t.events[r.event]}</span> : null}</dd></div>
          <div><dt>{t.request.when}</dt><dd>{spanText(r, locale, t.span, { year: true })}</dd></div>
          <div><dt>{t.request.cost}</dt><dd>{plural(t.units.days, r.days, locale)}{after !== null ? <span className="muted"> · {format(t.approvals.after, { days: formatDays(after, locale) })}</span> : null}</dd></div>
          {r.note && <div><dt>{t.request.note}</dt><dd className="pre">{r.note}</dd></div>}
          {r.reason && <div><dt>{t.request.reason}</dt><dd className="pre">{r.reason}</dd></div>}
        </dl>
        <RequestActions
          id={r.id}
          canCancel={r.sight === "own" && r.status === "pending"}
          canAskCancel={r.sight === "own" && r.status === "approved" && !r.cancelAsked && r.start > today()}
          canDecide={r.mayDecide && r.status === "pending"}
          canSettle={r.mayDecide && r.status === "approved" && r.cancelAsked}
          canCancelApproved={r.mayDecide && r.status === "approved" && !r.cancelAsked}
          canReopen={r.mayDecide && recent && (r.status === "approved" || r.status === "refused")}
          firstName={person?.name.split(" ")[0] ?? ""}
          t={{ approvals: t.approvals, home: t.home, request: t.request, errors: t.errors }}
        />
        <h2 className="section-title">{t.request.history}</h2>
        <ol className="steps">
          {steps.map((s, i) => (
            <li key={i}>
              <span>{format(t.request.steps[s.kind as keyof typeof t.request.steps] ?? s.kind, { name: s.kind === "left" ? nameOf(person, locale) : actorName(s.actor) })}</span>
              <time className="muted small" dateTime={s.at}>{formatDate(s.at, locale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</time>
              {s.reason && <p className="step-reason">{s.reason}</p>}
            </li>
          ))}
        </ol>
      </article>
    </main>
  );
}
