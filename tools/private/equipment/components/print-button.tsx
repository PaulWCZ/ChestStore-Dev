"use client";

import { Print } from "./icons.tsx";

export function PrintButton({ label }: { label: string }) {
  return <button type="button" className="button" onClick={() => window.print()}><Print />{label}</button>;
}
