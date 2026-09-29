"use client";

import { useRef } from "react";
import { formatDay } from "../lib/i18n/format.ts";

// A day, shown as the document writes it (28/10/2026, whatever the
// browser's own format) and chosen in the browser's calendar: the button
// opens the native picker of a field kept out of sight.
export function DateField({ id, value, locale, label, placeholder, required = false, onChange }: { id: string; value: string; locale: string; label: string; placeholder: string; required?: boolean; onChange: (day: string) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const shown = value ? formatDay(value, locale, { day: "2-digit", month: "2-digit", year: "numeric" }) : placeholder;
  function open() {
    const field = input.current;
    if (!field) return;
    try {
      field.showPicker();
    } catch {
      field.focus();
      field.click();
    }
  }
  return (
    <span className="date-field">
      <button type="button" id={id} className="ink num date-button" aria-label={`${label}: ${shown}`} onClick={open} suppressHydrationWarning>{shown}</button>
      <input ref={input} type="date" className="date-native" tabIndex={-1} aria-hidden="true" value={value} required={required} onChange={e => onChange(e.target.value)} />
    </span>
  );
}
