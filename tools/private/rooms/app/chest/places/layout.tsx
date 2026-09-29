import { EmptyState, PageHeader } from "@argentic/chest-ui/components";
import type { ReactNode } from "react";
import { can } from "../../../lib/access.ts";
import { viewer } from "../../../lib/session.ts";
import { PlacesTabs } from "./tabs.tsx";

// The admins' part: offices, rules, export. Others see why they cannot.
export default async function PlacesLayout({ children }: { children: ReactNode }) {
  const v = await viewer();
  if (!v) return null;
  const { member, t } = v;
  if (!can(member, "places.manage")) {
    return (
      <div className="narrow">
        <EmptyState headingLevel={1} title={t.places.title} body={t.errors.forbidden} />
      </div>
    );
  }
  return (
    <div className="narrow places">
      <PageHeader title={t.places.title} />
      <PlacesTabs label={t.places.title} words={t.places.tabs} />
      <div className="places-body">{children}</div>
    </div>
  );
}
