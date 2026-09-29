"use client";

import { StatusBadge, type Tone } from "@argentic/chest-ui/components";
import { useState } from "react";
import type { RowView, StampKind } from "../lib/rows.ts";
import { Alert, Calendar, Car, FileIcon, NoReceipt, Receipt } from "./icons.tsx";

// Small pieces every list of expenses uses.

// The receipt's thumbnail (the Chest makes it), or an icon for a PDF, a trip
// or no receipt; an image the Chest cannot give turns into the icon.
export function Thumb({ row }: { row: Pick<RowView, "thumb" | "icon"> }) {
  const [failed, setFailed] = useState(false);
  if (row.thumb && !failed) return <img className="thumb" src={row.thumb} alt="" loading="lazy" onError={() => setFailed(true)} />;
  return <span className="thumb" aria-hidden="true">{row.icon === "car" ? <Car /> : row.icon === "flat" ? <Calendar /> : row.icon === "pdf" ? <FileIcon /> : row.icon === "none" ? <NoReceipt /> : <Receipt />}</span>;
}

export function DateBox({ row }: { row: Pick<RowView, "day" | "month"> }) {
  return <span className="date-box" aria-hidden="true"><b>{row.day}</b><span>{row.month}</span></span>;
}

// Where an expense stands, as a rubber stamp on the receipt: the kit's
// StatusBadge (a shape and a word, never the colour alone), in the stamp's
// look (app/globals.css).
const tones: Record<StampKind | "cancelled", Tone> = { draft: "neutral", refused: "danger", submitted: "wait", approved: "ok", paid: "ok", imported: "neutral", cancelled: "neutral" };

export function Stamp({ kind, text, big = false }: { kind: StampKind | "cancelled"; text: string; big?: boolean }) {
  return <span className={`stamp ${kind}${big ? " big" : ""}`}><StatusBadge tone={tones[kind]} label={text} size="s" /></span>;
}

export function RowStamp({ row, big = false }: { row: Pick<RowView, "stamp">; big?: boolean }) {
  return <Stamp kind={row.stamp.kind} text={row.stamp.text} big={big} />;
}

// What deserves a look (a duplicate, no receipt, above the limit…): the
// kit's badge in the waiting tone, with a warning sign and its words.
export function Warning({ text }: { text: string }) {
  return <StatusBadge tone="wait" icon={<Alert />} label={text} size="s" />;
}

export function Warnings({ list }: { list: string[] }) {
  return <>{list.map(w => <Warning key={w} text={w} />)}</>;
}

// A thumbnail that opens its receipt: a photo in a large preview (the
// caller's lightbox), a PDF in a new tab; nothing to open, just the icon.
export function ReceiptThumb({ row, label, onPreview }: { row: Pick<RowView, "thumb" | "icon" | "open" | "preview">; label: string; onPreview: () => void }) {
  if (row.preview) return <button type="button" className="thumb-button" onClick={onPreview}><Thumb row={row} /><span className="visually-hidden">{label}</span></button>;
  if (row.open) return <a className="thumb-button" href={row.open} target="_blank" rel="noopener"><Thumb row={row} /><span className="visually-hidden">{label}</span></a>;
  return <Thumb row={row} />;
}
