"use client";

import { Printer } from "../../../../components/icons.tsx";

// The browser's own printing: a printer, or "Save as PDF".
export function PrintButton({ label }: { label: string }) {
  return <button type="button" className="button small" onClick={() => window.print()}><Printer />{label}</button>;
}
