import type { Catalogue } from "./i18n/index.ts";
import type { Examples } from "./journeys.ts";

// The two example templates offered on an empty page, in the words of the
// catalogue HR reads: who does each step, and on which day.
export function examples(t: Catalogue): Examples {
  const on = t.checklists.examples.onboarding;
  const off = t.checklists.examples.offboarding;
  return {
    onboarding: {
      name: on.name,
      items: [
        { text: on.items.laptop, role: "hr", offset: -14 },
        { text: on.items.accounts, role: "hr", offset: -3 },
        { text: on.items.desk, role: "hr", offset: -1 },
        { text: on.items.welcome, role: "manager", offset: 0 },
        { text: on.items.lunch, role: "manager", offset: 0 },
        { text: on.items.profile, role: "person", offset: 1 },
        { text: on.items.handbook, role: "person", offset: 2 },
        { text: on.items.goals, role: "manager", offset: 7 },
        { text: on.items.checkIn, role: "manager", offset: 30 },
      ],
    },
    offboarding: {
      name: off.name,
      items: [
        { text: off.items.handover, role: "manager", offset: -14 },
        { text: off.items.farewell, role: "manager", offset: -1 },
        { text: off.items.equipment, role: "person", offset: 0 },
        { text: off.items.access, role: "hr", offset: 0 },
        { text: off.items.documents, role: "hr", offset: 0 },
      ],
    },
  };
}
