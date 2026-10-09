import { Avatar, StatusBadge } from "@argentic/chest-ui/components";
import type { ReactNode } from "react";
import type { Row } from "../lib/view.ts";
import { Alert, CategoryIcon, Clock } from "./icons.tsx";

// Small pieces every page uses; no state, safe on both sides.

// The asset tag as it is printed on the label: monospaced, on orange tape.
export function AssetTag({ tag, large = false }: { tag: string; large?: boolean }) {
  return <span className={large ? "asset-tag large" : "asset-tag"} translate="no">{tag}</span>;
}

// Every stamp the tool prints: an item's status, a request's, a receipt's,
// low stock. Each is the kit's badge — a shape (or the category's dot) and
// its word, never the colour alone — on the state colours of the look, or
// on a slot of its categorical palette (in use: slot 1, blue; retired and
// cancelled: slot 8, steel, with a dashed edge).
export type StampKind =
  | "in_stock" | "in_use" | "in_repair" | "lost" | "retired"
  | "open" | "approved" | "refused" | "done" | "cancelled"
  | "low" | "confirm" | "received";
const stamps: Record<StampKind, { tone?: "ok" | "wait" | "danger"; category?: 1 | 8; dashed?: boolean }> = {
  in_stock: { tone: "ok" }, in_use: { category: 1 }, in_repair: { tone: "wait" }, lost: { tone: "danger" }, retired: { category: 8, dashed: true },
  open: { category: 1 }, approved: { tone: "ok" }, refused: { tone: "danger" }, done: { tone: "ok" }, cancelled: { category: 8, dashed: true },
  low: { tone: "wait" }, confirm: { tone: "wait" }, received: { tone: "ok" },
};

export function StatusStamp({ status, text }: { status: StampKind; text: string }) {
  const s = stamps[status];
  const className = `stamp st-${status}${s.dashed ? " dashed" : ""}`;
  return s.category
    ? <StatusBadge category={s.category} label={text} size="s" className={className} />
    : <StatusBadge tone={s.tone ?? "neutral"} label={text} size="s" className={className} />;
}

// Who or where, with a face when it is a person.
export function HolderLine({ row }: { row: Row }) {
  const h = row.holder;
  if (h.kind === "member") return <span className={h.gone ? "holder gone" : "holder"}><Avatar name={h.name} photo={h.photo} size="s" />{row.holderText}</span>;
  if (h.kind === "stock") return <span className={h.low ? "holder low" : "holder"}>{row.holderText}</span>;
  const quiet = h.kind === "none";
  return <span className={quiet ? "holder muted" : "holder"}>{row.holderText}</span>;
}

// One item as a line of a list: a label you can open.
export function ItemLine({ row, lead, extra }: { row: Row; lead?: ReactNode; extra?: ReactNode }) {
  return (
    <li className="line">
      {lead}
      <a className="line-main" href={`/chest/items/${row.id}`}>
        <span className="line-icon" aria-hidden="true"><CategoryIcon name={row.icon} /></span>
        <span className="line-what">
          <span className="line-name">{row.name}</span>
          <span className="line-sub"><AssetTag tag={row.tag} /><span>{row.category}</span>{row.serial && <span className="mono muted small">{row.serial}</span>}</span>
        </span>
      </a>
      <span className="line-status"><StatusStamp status={row.status} text={row.statusText} />{row.problems > 0 && <span className="flag"><Alert /><span className="visually-hidden">{row.problemsLabel}</span></span>}{row.low && <StatusStamp status="low" text={row.lowLabel} />}</span>
      <span className="line-holder"><HolderLine row={row} />{row.since && <span className="small muted">{row.since}</span>}</span>
      <span className="line-end">{row.ending ? <span className={`ending ${row.ending.state}`}><Clock />{row.ending.text} · {row.ending.when}</span> : null}</span>
      {extra}
    </li>
  );
}
