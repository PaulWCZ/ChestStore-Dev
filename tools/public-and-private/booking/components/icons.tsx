import type { ReactNode } from "react";

// Booking's own icons: rounded 24-unit strokes in the text's colour.
// Decorative (aria-hidden): every control that shows one also has words.
function Icon({ children }: { children: ReactNode }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{children}</svg>;
}

export const Calendar = () => <Icon><rect x="3.5" y="5" width="17" height="15.5" rx="2.5" /><path d="M3.5 10h17M8 3v4M16 3v4" /></Icon>;
export const CalendarCheck = () => <Icon><rect x="3.5" y="5" width="17" height="15.5" rx="2.5" /><path d="M3.5 10h17M8 3v4M16 3v4M9 15l2 2 4-4" /></Icon>;
export const CalendarOff = () => <Icon><rect x="3.5" y="5" width="17" height="15.5" rx="2.5" /><path d="M3.5 10h17M8 3v4M16 3v4M10 13.5l4 4M14 13.5l-4 4" /></Icon>;
export const Clock = () => <Icon><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></Icon>;
export const Pin = () => <Icon><path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0113 0c0 5.4-6.5 11-6.5 11z" /><circle cx="12" cy="10" r="2.3" /></Icon>;
export const Phone = () => <Icon><path d="M5 4h3.5l1.5 4.5-2 1.3a11 11 0 005.2 5.2l1.3-2 4.5 1.5V18a2 2 0 01-2 2A15.5 15.5 0 013 6a2 2 0 012-2z" /></Icon>;
export const Video = () => <Icon><rect x="3" y="6.5" width="12.5" height="11" rx="2.5" /><path d="M15.5 10.5l5-3v9l-5-3" /></Icon>;
export const Chat = () => <Icon><path d="M4 5.5h16v10H9.5L5 19.5v-4H4z" /></Icon>;
export const Person = () => <Icon><circle cx="12" cy="8" r="3.5" /><path d="M5 20a7 7 0 0114 0" /></Icon>;
export const Check = () => <Icon><path d="M5 12.5l4.5 4.5L19 7.5" /></Icon>;
export const Close = () => <Icon><path d="M6 6l12 12M18 6L6 18" /></Icon>;
export const Bin = () => <Icon><path d="M4 7h16M9 7V4.5h6V7M6 7l1 13h10l1-13" /></Icon>;
export const Alert = () => <Icon><path d="M12 3.5l9 16H3z" /><path d="M12 10v4M12 17h.01" /></Icon>;
export const Mail = () => <Icon><rect x="3.5" y="5.5" width="17" height="13" rx="2" /><path d="M4 7l8 6 8-6" /></Icon>;
export const Globe = () => <Icon><circle cx="12" cy="12" r="8.5" /><path d="M3.5 12h17M12 3.5c2.5 2.6 3.5 5.4 3.5 8.5s-1 5.9-3.5 8.5c-2.5-2.6-3.5-5.4-3.5-8.5s1-5.9 3.5-8.5z" /></Icon>;
export const Back = () => <Icon><path d="M15 5l-7 7 7 7" /></Icon>;
export const Next = () => <Icon><path d="M9 5l7 7-7 7" /></Icon>;
export const Arrow = () => <Icon><path d="M5 12h14M13 6l6 6-6 6" /></Icon>;
export const Copy = () => <Icon><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V5.5A1.5 1.5 0 0014.5 4h-9A1.5 1.5 0 004 5.5v9A1.5 1.5 0 005.5 16H8" /></Icon>;
export const Download = () => <Icon><path d="M12 4v12M7 11l5 5 5-5M4 20h16" /></Icon>;
export const Plus = () => <Icon><path d="M12 5v14M5 12h14" /></Icon>;
export const Pencil = () => <Icon><path d="M4 20l4.5-1 10-10a2.1 2.1 0 00-3-3l-10 10z" /><path d="M13.5 7.5l3 3" /></Icon>;
export const Link = () => <Icon><path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7L11.5 6.8" /><path d="M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1.5-1.5" /></Icon>;
export const Gear = () => <Icon><path d="M4 7h10M18 7h2M4 17h4M12 17h8" /><circle cx="16" cy="7" r="2" /><circle cx="10" cy="17" r="2" /></Icon>;
export const Hourglass = () => <Icon><path d="M7 3.5h10M7 20.5h10M8 3.5c0 4.5 8 5 8 8.5s-8 4-8 8.5M16 3.5c0 4.5-8 5-8 8.5s8 4 8 8.5" /></Icon>;
export const Stack = () => <Icon><path d="M12 4l8.5 4.5L12 13 3.5 8.5z" /><path d="M3.5 12.5L12 17l8.5-4.5M3.5 16.5L12 21l8.5-4.5" /></Icon>;
export const Moved = () => <Icon><path d="M4 12a8 8 0 0113.7-5.6L20 8.5M20 4v4.5h-4.5" /><path d="M20 12a8 8 0 01-13.7 5.6L4 15.5M4 20v-4.5h4.5" /></Icon>;

export const kindIcon = { place: Pin, phone: Phone, video: Video, other: Chat } as const;
