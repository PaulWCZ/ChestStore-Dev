import type { ReactNode } from "react";

// The tool's own icons: soft, rounded 24-unit strokes in the text's colour.
// Decorative (aria-hidden): every control that shows one also has words.
function Icon({ children }: { children: ReactNode }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{children}</svg>;
}

export const Sun = () => <Icon><circle cx="12" cy="12" r="4" /><path d="M12 2.5v2M12 19.5v2M4.5 12h-2M21.5 12h-2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4" /></Icon>;
export const Calendar = () => <Icon><rect x="3.5" y="5" width="17" height="15.5" rx="3.5" /><path d="M3.5 10h17M8 3v4M16 3v4" /></Icon>;
export const Inbox = () => <Icon><path d="M4 13.5l2.2-7.1A2 2 0 018.1 5h7.8a2 2 0 011.9 1.4l2.2 7.1V18a2 2 0 01-2 2H6a2 2 0 01-2-2z" /><path d="M4 13.5h4.5l1.5 2.5h4l1.5-2.5H20" /></Icon>;
export const People = () => <Icon><circle cx="9" cy="8.5" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0113 0M16 5.5a3.5 3.5 0 010 7M18 14.5a6.5 6.5 0 013.5 5.5" /></Icon>;
export const Gear = () => <Icon><path d="M4 7h10M18 7h2M4 17h4M12 17h8" /><circle cx="16" cy="7" r="2" /><circle cx="10" cy="17" r="2" /></Icon>;
export const Plus = () => <Icon><path d="M12 5v14M5 12h14" /></Icon>;
export const Check = () => <Icon><path d="M5 12.5l4.5 4.5L19 7.5" /></Icon>;
export const Close = () => <Icon><path d="M6 6l12 12M18 6L6 18" /></Icon>;
export const Back = () => <Icon><path d="M15 5l-7 7 7 7" /></Icon>;
export const Next = () => <Icon><path d="M9 5l7 7-7 7" /></Icon>;
export const Arrow = () => <Icon><path d="M5 12h14M13 6l6 6-6 6" /></Icon>;
export const Download = () => <Icon><path d="M12 4v12M7 11l5 5 5-5M4 20h16" /></Icon>;
export const Upload = () => <Icon><path d="M12 16V4M7 9l5-5 5 5M4 20h16" /></Icon>;
export const Clock = () => <Icon><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></Icon>;
export const Gift = () => <Icon><rect x="3.5" y="8" width="17" height="4" rx="1.5" /><path d="M5 12v7a1.5 1.5 0 001.5 1.5h11A1.5 1.5 0 0019 19v-7M12 8v12.5M12 8S10.5 3.5 8 4.5 9 8 12 8zM12 8s1.5-4.5 4-3.5S15 8 12 8z" /></Icon>;
export const Info = () => <Icon><circle cx="12" cy="12" r="8.5" /><path d="M12 11v5M12 8h.01" /></Icon>;
export const Pencil = () => <Icon><path d="M4 20l1-4L16 5l3 3L8 19z" /><path d="M14 7l3 3" /></Icon>;
