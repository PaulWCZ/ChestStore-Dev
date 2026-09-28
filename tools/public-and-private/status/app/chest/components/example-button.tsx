"use client";

import type { ErrorCode } from "../../../lib/app-error.ts";
import { useRun } from "../../../components/use-run.ts";
import { addExample } from "../actions.ts";

// One click to a first status page: a handful of usual components, in the
// editor's language, to rename or delete.
export function ExampleButton({ names, label, errors }: { names: string[]; label: string; errors: Record<ErrorCode, string> }) {
  const { run, pending } = useRun(errors);
  return <button type="button" className="button" disabled={pending} onClick={() => run(() => addExample(names))}>{label}</button>;
}
