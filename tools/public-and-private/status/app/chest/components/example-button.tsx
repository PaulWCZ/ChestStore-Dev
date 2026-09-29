"use client";

import { EmptyState } from "@argentic/chest-ui/components";
import type { ErrorCode } from "../../../lib/app-error.ts";
import { useRun } from "../../../components/use-run.ts";
import { addExample } from "../actions.ts";

// A status page with no service yet: say what comes first, and offer one
// click to a first page — a handful of usual services, in the editor's
// language, to rename or delete — or the Services page to list their own.
export function SetupEmpty({ title, body, names, example, setup, errors }: { title: string; body: string; names: string[]; example: string; setup: string; errors: Record<ErrorCode, string> }) {
  const { run, pending } = useRun(errors);
  return (
    <EmptyState
      title={title}
      body={body}
      action={<button type="button" className="button" disabled={pending} onClick={() => void run(() => addExample(names))}>{example}</button>}
      example={{ label: setup, href: "/chest/components" }}
    />
  );
}
