import type { ReactNode } from "react";

// The tool's icons, drawn here on a 24-unit grid with round strokes (no
// icon font, nothing fetched). Decorative: the words beside them say it.
function Icon({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {children}
    </svg>
  );
}

export const Plus = () => <Icon><path d="M12 5v14M5 12h14" /></Icon>;
export const Check = () => <Icon><path d="M5 12.5l4.5 4.5L19 7.5" /></Icon>;
export const Maybe = () => <Icon><path d="M5 13c2-3 4-3 7 0s5 3 7 0" /></Icon>;
export const Cross = () => <Icon><path d="M7 7l10 10M17 7L7 17" /></Icon>;
export const Clock = () => <Icon><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></Icon>;
export const People = () => <Icon><circle cx="9" cy="9" r="3.2" /><path d="M3.5 19c.6-3 2.8-4.8 5.5-4.8s4.9 1.8 5.5 4.8" /><path d="M15.5 6.2a3 3 0 010 5.6M17.5 14.6c1.6.6 2.7 2.1 3 4.4" /></Icon>;
export const Mask = () => <Icon><path d="M3 8c3-1.5 6-1.5 9 0 3-1.5 6-1.5 9 0 0 5-2 9-5.5 9-2 0-2.7-2-3.5-2s-1.5 2-3.5 2C5 17 3 13 3 8z" /><path d="M7 11h2M15 11h2" /></Icon>;
export const Eye = () => <Icon><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" /><circle cx="12" cy="12" r="2.8" /></Icon>;
export const Star = () => <Icon><path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.8l-5.2 2.8 1-5.8-4.3-4.1 5.9-.9z" /></Icon>;
export const Back = () => <Icon><path d="M15 5l-7 7 7 7" /></Icon>;
export const Next = () => <Icon><path d="M9 5l7 7-7 7" /></Icon>;
export const Up = () => <Icon><path d="M6 14l6-6 6 6" /></Icon>;
export const Down = () => <Icon><path d="M6 10l6 6 6-6" /></Icon>;
export const Trash = () => <Icon><path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 12.5h9l1-12.5" /></Icon>;
export const Download = () => <Icon><path d="M12 4v11M7 10.5l5 5 5-5M5 19.5h14" /></Icon>;
export const Pencil = () => <Icon><path d="M4 20l1-4.5L15.5 5a2 2 0 012.8 0l.7.7a2 2 0 010 2.8L8.5 19 4 20z" /></Icon>;
export const Lock = () => <Icon><rect x="5" y="10.5" width="14" height="10" rx="3" /><path d="M8.5 10.5V8a3.5 3.5 0 017 0v2.5" /></Icon>;
export const Send = () => <Icon><path d="M4 12l16-7.5L14.5 20l-2.8-6.2L4 12z" /><path d="M11.7 13.8L20 4.5" /></Icon>;
export const Info = () => <Icon><circle cx="12" cy="12" r="8.5" /><path d="M12 11v5.5M12 7.8v.2" /></Icon>;
export const Party = () => <Icon><path d="M4 20l4.5-12L16 15.5 4 20z" /><path d="M14 4.5c.5 1.5 0 2.5-1 3M19.5 10c-1.5-.5-2.5 0-3 1M17 3.5v2M20.5 7h-2M15.5 8.5l1-1" /></Icon>;
export const Repeat = () => <Icon><path d="M4.5 11V9.5a3 3 0 013-3h11M15.5 3.5l3 3-3 3" /><path d="M19.5 13v1.5a3 3 0 01-3 3h-11M8.5 20.5l-3-3 3-3" /></Icon>;
export const Bell = () => <Icon><path d="M6 16.5V11a6 6 0 0112 0v5.5l1.5 2h-15z" /><path d="M10 20.5a2 2 0 004 0" /></Icon>;
export const Chat = () => <Icon><path d="M4 6.5a2.5 2.5 0 012.5-2.5h11A2.5 2.5 0 0120 6.5v7a2.5 2.5 0 01-2.5 2.5H11l-4.5 4v-4A2.5 2.5 0 014 13.5z" /></Icon>;
export const Trend = () => <Icon><path d="M3.5 17l5-5.5 4 3.5 7.5-8" /><path d="M15 7h5v5" /></Icon>;
export const Pulse = () => <Icon><path d="M3 12h4l2.5-6 4.5 12 2.5-6H21" /></Icon>;
export const CalendarPlus = () => <Icon><rect x="3.5" y="5" width="17" height="15" rx="3" /><path d="M8 3v4M16 3v4M3.5 10h17M12 13v4.5M9.8 15.2h4.4" /></Icon>;

// The three kinds, each its own picture.
export const Question = () => <Icon><path d="M5 5.5h14a2 2 0 012 2V15a2 2 0 01-2 2h-6l-4.5 3.5V17H5a2 2 0 01-2-2V7.5a2 2 0 012-2z" /><path d="M7.5 10h4M7.5 13h8" /></Icon>;
export const Calendar = () => <Icon><rect x="3.5" y="5" width="17" height="15" rx="3" /><path d="M8 3v4M16 3v4M3.5 10h17" /><path d="M8.5 14.5l2 2 4-4" /></Icon>;
export const Survey = () => <Icon><rect x="4.5" y="3.5" width="15" height="17" rx="3" /><path d="M8 8.5h1M11.5 8.5H16M8 12.5h1M11.5 12.5H16M8 16.5h1M11.5 16.5H14" /></Icon>;

export function KindIcon({ kind }: { kind: "choice" | "date" | "survey" }) {
  return kind === "date" ? <Calendar /> : kind === "survey" ? <Survey /> : <Question />;
}
