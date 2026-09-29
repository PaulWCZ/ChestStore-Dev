import type { ReactNode } from "react";

// Support's own icons: rounded 24-unit strokes in the text's colour.
// Decorative (aria-hidden): every control that shows one also has words.
function Icon({ children }: { children: ReactNode }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{children}</svg>;
}

export const Inbox = () => <Icon><path d="M3.5 13.5l2.8-7.2A2 2 0 018.2 5h7.6a2 2 0 011.9 1.3l2.8 7.2V18a1.5 1.5 0 01-1.5 1.5h-14A1.5 1.5 0 013.5 18z" /><path d="M3.5 13.5H8l1.5 2.5h5l1.5-2.5h4.5" /></Icon>;
export const Person = () => <Icon><circle cx="12" cy="8" r="3.5" /><path d="M5 20a7 7 0 0114 0" /></Icon>;
export const People = () => <Icon><circle cx="9" cy="8.5" r="3.2" /><path d="M3 19.5a6 6 0 0112 0M16 5.8a3.2 3.2 0 010 6.2M17.5 14a6 6 0 013.5 5.5" /></Icon>;
export const Clock = () => <Icon><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></Icon>;
export const Check = () => <Icon><path d="M5 12.5l4.5 4.5L19 7.5" /></Icon>;
export const Bin = () => <Icon><path d="M4 7h16M9 7V4.5h6V7M6 7l1 13h10l1-13" /></Icon>;
export const Alert = () => <Icon><path d="M12 3.5l9 16H3z" /><path d="M12 10v4M12 17h.01" /></Icon>;
export const Send = () => <Icon><path d="M4 12l16-8-6 16-2.5-6.5z" /><path d="M11.5 13.5L20 4" /></Icon>;
export const Note = () => <Icon><path d="M5 4h10l4 4v12H5z" /><path d="M15 4v4h4M8.5 12.5h7M8.5 16h5" /></Icon>;
export const Search = () => <Icon><circle cx="11" cy="11" r="6.5" /><path d="M20 20l-4.2-4.2" /></Icon>;
export const Gear = () => <Icon><path d="M4 7h10M18 7h2M4 17h4M12 17h8" /><circle cx="16" cy="7" r="2" /><circle cx="10" cy="17" r="2" /></Icon>;
export const Plus = () => <Icon><path d="M12 5v14M5 12h14" /></Icon>;
export const Mail = () => <Icon><rect x="3.5" y="5.5" width="17" height="13" rx="2" /><path d="M4 7l8 6 8-6" /></Icon>;
export const Globe = () => <Icon><circle cx="12" cy="12" r="8.5" /><path d="M3.5 12h17M12 3.5c2.5 2.6 3.5 5.4 3.5 8.5s-1 5.9-3.5 8.5c-2.5-2.6-3.5-5.4-3.5-8.5s1-5.9 3.5-8.5z" /></Icon>;
export const Clip = () => <Icon><path d="M20 11.5l-7.8 7.8a5 5 0 01-7-7L13 4.5a3.3 3.3 0 014.7 4.7l-7.8 7.7a1.7 1.7 0 01-2.3-2.3l7-7" /></Icon>;
export const Back = () => <Icon><path d="M15 5l-7 7 7 7" /></Icon>;
export const Copy = () => <Icon><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V5.5A1.5 1.5 0 0014.5 4h-9A1.5 1.5 0 004 5.5v9A1.5 1.5 0 005.5 16H8" /></Icon>;
export const Reply = () => <Icon><path d="M10 7L4 12l6 5" /><path d="M4.5 12H14a6 6 0 016 6v1" /></Icon>;
export const Quote = () => <Icon><path d="M7 7h10M7 11h10M7 15h6" /><rect x="3.5" y="3.5" width="17" height="17" rx="3" /></Icon>;
export const Download = () => <Icon><path d="M12 4v12M7 11l5 5 5-5M4 20h16" /></Icon>;
export const Eye = () => <Icon><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" /><circle cx="12" cy="12" r="2.8" /></Icon>;
export const Heart = () => <Icon><path d="M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0112 7.3 4.3 4.3 0 0119.5 10c0 5.4-7.5 10-7.5 10z" /></Icon>;
export const Cross = () => <Icon><path d="M6.5 6.5l11 11M17.5 6.5l-11 11" /></Icon>;
export const Tag = () => <Icon><path d="M3.5 12.2V4.5a1 1 0 011-1h7.7a1 1 0 01.7.3l7.8 7.8a1 1 0 010 1.4l-7.7 7.7a1 1 0 01-1.4 0l-7.8-7.8a1 1 0 01-.3-.7z" /><circle cx="8" cy="8" r="1.4" /></Icon>;
// Priority: a flag for urgent, one chevron up for high, one down for low.
export const Flag = () => <Icon><path d="M5.5 21V4" /><path d="M5.5 4.5h11l-2.5 4 2.5 4h-11" /></Icon>;
export const Up = () => <Icon><path d="M6 15l6-6 6 6" /></Icon>;
export const Down = () => <Icon><path d="M6 9l6 6 6-6" /></Icon>;
export const Star = () => <Icon><path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z" /></Icon>;
export const Chart = () => <Icon><path d="M4 20V4M4 20h16" /><path d="M8 16v-4M12 16V8M16 16v-6" /></Icon>;
export const Merge = () => <Icon><path d="M6 4v5a5 5 0 005 5h7" /><path d="M15 11l3 3-3 3" /><path d="M6 20v-4" /></Icon>;
