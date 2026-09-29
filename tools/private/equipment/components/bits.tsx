import Link from "next/link";
import type { ReactNode } from "react";
import type { Row } from "../lib/view.ts";
import { Avatar } from "./avatar.tsx";
import { Alert, CategoryIcon, Clock } from "./icons.tsx";

// Small pieces every page uses; no state, safe on both sides.

// The asset tag as it is printed on the label: monospaced, on orange tape.
export function AssetTag({ tag, large = false }: { tag: string; large?: boolean }) {
  return <span className={large ? "asset-tag large" : "asset-tag"} translate="no">{tag}</span>;
}

export function StatusStamp({ status, text }: { status: string; text: string }) {
  return <span className={`stamp st-${status}`}>{text}</span>;
}

// Who or where, with a face when it is a person.
export function HolderLine({ row }: { row: Row }) {
  const h = row.holder;
  if (h.kind === "member") return <span className={h.gone ? "holder gone" : "holder"}><Avatar name={h.name} photo={h.photo} size={24} />{row.holderText}</span>;
  if (h.kind === "stock") return <span className={h.low ? "holder low" : "holder"}>{row.holderText}</span>;
  return <span className={h.kind === "none" ? "holder muted" : "holder"}>{row.holderText}</span>;
}

// One item as a line of a list: a label you can open.
export function ItemLine({ row, lead, extra }: { row: Row; lead?: ReactNode; extra?: ReactNode }) {
  return (
    <li className="line">
      {lead}
      <Link className="line-main" href={`/chest/items/${row.id}`}>
        <span className="line-icon" aria-hidden="true"><CategoryIcon name={row.icon} /></span>
        <span className="line-what">
          <span className="line-name">{row.name}</span>
          <span className="line-sub"><AssetTag tag={row.tag} /><span className="line-cat">{row.category}</span>{row.serial && <span className="mono muted small">{row.serial}</span>}</span>
        </span>
      </Link>
      <span className="line-status"><StatusStamp status={row.status} text={row.statusText} />{row.problems > 0 && <span className="flag"><Alert /><span className="visually-hidden">{row.problemsLabel}</span></span>}{row.low && <span className="stamp st-low">{row.lowLabel}</span>}</span>
      <span className="line-holder"><HolderLine row={row} />{row.since && <span className="small muted">{row.since}</span>}</span>
      <span className="line-end">{row.ending ? <span className={`ending ${row.ending.state}`}><Clock />{row.ending.text} · {row.ending.when}</span> : null}</span>
      {extra}
    </li>
  );
}
