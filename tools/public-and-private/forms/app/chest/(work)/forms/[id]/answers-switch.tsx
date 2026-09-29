import { Tabs } from "@argentic/chest-ui/components";

// The Answers tab's two views, the kit's link tabs: the answers
// themselves, and their summary.
export function AnswersSwitch({ base, current, list, summary, label }: { base: string; current: "list" | "summary"; list: string; summary: string; label: string }) {
  return (
    <div className="view-switch">
      <Tabs items={[{ id: "list", label: list, href: `${base}/answers` }, { id: "summary", label: summary, href: `${base}/summary` }]} current={current} label={label} />
    </div>
  );
}
