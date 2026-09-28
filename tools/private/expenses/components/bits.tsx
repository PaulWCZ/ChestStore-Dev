"use client";

import { useState } from "react";
import type { RowView } from "../lib/rows.ts";
import { Alert, Car, FileIcon, Receipt } from "./icons.tsx";

// Small pieces every list of expenses uses.

// The receipt's thumbnail (the Chest makes it), or an icon for a PDF, a trip
// or no receipt; an image the Chest cannot give turns into the icon.
export function Thumb({ row }: { row: Pick<RowView, "thumb" | "icon"> }) {
  const [failed, setFailed] = useState(false);
  if (row.thumb && !failed) return <img className="thumb" src={row.thumb} alt="" loading="lazy" onError={() => setFailed(true)} />;
  return <span className="thumb" aria-hidden="true">{row.icon === "car" ? <Car /> : row.icon === "pdf" ? <FileIcon /> : <Receipt />}</span>;
}

export function DateBox({ row }: { row: Pick<RowView, "day" | "month"> }) {
  return <span className="date-box" aria-hidden="true"><b>{row.day}</b><span>{row.month}</span></span>;
}

export function Stamp({ row, big = false }: { row: Pick<RowView, "stamp">; big?: boolean }) {
  return <span className={`stamp ${row.stamp.kind}${big ? " big" : ""}`}>{row.stamp.text}</span>;
}

export function Warnings({ list }: { list: string[] }) {
  return <>{list.map(w => <span key={w} className="warn"><Alert />{w}</span>)}</>;
}
