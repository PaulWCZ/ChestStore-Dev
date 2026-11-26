import { EmptyState } from "@argentic/chest-ui/components";
import type { View } from "@argentic/chest-app";
import type { Catalogue } from "../i18n/index.ts";

// A host's page (types, hours, a new booking) for someone whose role does
// not host: why, not an error.
export const cannotHost = (t: Catalogue): View => ({
  title: t.bookings.cannotHostTitle,
  body: <EmptyState headingLevel={1} title={t.bookings.cannotHostTitle} body={t.bookings.cannotHost} />,
});
