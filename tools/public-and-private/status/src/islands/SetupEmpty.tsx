import { EmptyState } from "@argentic/chest-ui/components";
import { useRun } from "../components/use-run.ts";

// A status page with no service yet: say what comes first, and offer one
// click to a first page — a handful of usual services, in the editor's
// language and the other one, to rename or delete — or the Services page
// to list their own.
export function SetupEmpty({ title, body, example, setup }: { title: string; body: string; example: string; setup: string }) {
  const { run, pending } = useRun();
  return (
    <EmptyState
      title={title}
      body={body}
      action={<button type="button" className="button" disabled={pending} onClick={() => void run("addExample", {})}>{example}</button>}
      example={{ label: setup, href: "/chest/components" }}
    />
  );
}
