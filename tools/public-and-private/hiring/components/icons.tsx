import type { ReactNode } from "react";

// Hiring's own icons: 24-unit strokes, square-ish ends, in the text's
// colour. Decorative (aria-hidden): every control that shows one also has
// words, visible or for screen readers.
function Icon({ children }: { children: ReactNode }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{children}</svg>;
}

export const Plus = () => <Icon><path d="M12 5v14M5 12h14" /></Icon>;
export const Check = () => <Icon><path d="M5 12.5l4.5 4.5L19 7.5" /></Icon>;
export const Close = () => <Icon><path d="M6 6l12 12M18 6L6 18" /></Icon>;
export const Arrow = () => <Icon><path d="M5 12h14M13 6l6 6-6 6" /></Icon>;
export const Back = () => <Icon><path d="M19 12H5M11 6l-6 6 6 6" /></Icon>;
export const Up = () => <Icon><path d="M12 19V5M6 11l6-6 6 6" /></Icon>;
export const Down = () => <Icon><path d="M12 5v14M6 13l6 6 6-6" /></Icon>;
export const Pin = () => <Icon><path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0113 0c0 5.4-6.5 11-6.5 11z" /><circle cx="12" cy="10" r="2.3" /></Icon>;
export const Briefcase = () => <Icon><rect x="3.5" y="7" width="17" height="12.5" rx="2" /><path d="M9 7V5.5A1.5 1.5 0 0110.5 4h3A1.5 1.5 0 0115 5.5V7M3.5 12.5h17" /></Icon>;
export const House = () => <Icon><path d="M4 11l8-6.5 8 6.5M6.5 9.5V19.5h11V9.5" /><path d="M10 19.5v-5h4v5" /></Icon>;
export const Coins = () => <Icon><ellipse cx="12" cy="7" rx="7" ry="2.8" /><path d="M5 7v5c0 1.5 3.1 2.8 7 2.8s7-1.3 7-2.8V7M5 12v5c0 1.5 3.1 2.8 7 2.8s7-1.3 7-2.8v-5" /></Icon>;
export const People = () => <Icon><circle cx="9" cy="8.5" r="3.2" /><path d="M3 19.5a6 6 0 0112 0M16 5.8a3.2 3.2 0 010 6.2M17.5 14a6 6 0 013.5 5.5" /></Icon>;
export const Person = () => <Icon><circle cx="12" cy="8" r="3.5" /><path d="M5 20a7 7 0 0114 0" /></Icon>;
export const Star = () => <Icon><path d="M12 3.8l2.5 5.2 5.7.8-4.1 4 1 5.6L12 16.7l-5.1 2.7 1-5.6-4.1-4 5.7-.8z" /></Icon>;
export const Clock = () => <Icon><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></Icon>;
export const File = () => <Icon><path d="M6 3.5h8l4 4V20.5H6z" /><path d="M14 3.5v4h4M9 12.5h6M9 16h4" /></Icon>;
export const Download = () => <Icon><path d="M12 4v12M7 11l5 5 5-5M4 20h16" /></Icon>;
export const External = () => <Icon><path d="M14 4h6v6M20 4l-9 9M18 14v5.5H4.5V6H10" /></Icon>;
export const Mail = () => <Icon><rect x="3.5" y="5.5" width="17" height="13" rx="2" /><path d="M4 7l8 6 8-6" /></Icon>;
export const Phone = () => <Icon><path d="M6.5 3.5h3l1.5 4.5-2 1.5a11 11 0 005.5 5.5l1.5-2 4.5 1.5v3a2 2 0 01-2 2A16 16 0 014.5 5.5a2 2 0 012-2z" /></Icon>;
export const Link = () => <Icon><path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1" /></Icon>;
export const Note = () => <Icon><path d="M5 4h10l4 4v12H5z" /><path d="M15 4v4h4M8.5 12.5h7M8.5 16h5" /></Icon>;
export const Chat = () => <Icon><path d="M4 5.5h16v10H9l-5 4z" /></Icon>;
export const Gear = () => <Icon><path d="M4 7h10M18 7h2M4 17h4M12 17h8" /><circle cx="16" cy="7" r="2" /><circle cx="10" cy="17" r="2" /></Icon>;
export const Dots = () => <Icon><circle cx="5.5" cy="12" r="1.2" /><circle cx="12" cy="12" r="1.2" /><circle cx="18.5" cy="12" r="1.2" /></Icon>;
export const Pencil = () => <Icon><path d="M4 20l1-4.5L15.5 5a2.1 2.1 0 013 3L8 18.5z" /><path d="M13.5 7l3 3" /></Icon>;
export const Bin = () => <Icon><path d="M4 7h16M9 7V4.5h6V7M6 7l1 13h10l1-13" /></Icon>;
export const Eye = () => <Icon><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" /><circle cx="12" cy="12" r="2.8" /></Icon>;
export const Upload = () => <Icon><path d="M12 16V4M7 9l5-5 5 5M4 20h16" /></Icon>;
export const Globe = () => <Icon><circle cx="12" cy="12" r="8.5" /><path d="M3.5 12h17M12 3.5c2.5 2.6 3.5 5.4 3.5 8.5s-1 5.9-3.5 8.5c-2.5-2.6-3.5-5.4-3.5-8.5s1-5.9 3.5-8.5z" /></Icon>;
export const Copy = () => <Icon><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V5.5A1.5 1.5 0 0014.5 4h-9A1.5 1.5 0 004 5.5v9A1.5 1.5 0 005.5 16H8" /></Icon>;
export const Undo = () => <Icon><path d="M9 7L4 12l5 5" /><path d="M4.5 12H15a5 5 0 010 10h-2" /></Icon>;
export const Bold = () => <Icon><path d="M7 5h6a3.5 3.5 0 010 7H7zM7 12h7a3.5 3.5 0 010 7H7z" /></Icon>;
export const List = () => <Icon><path d="M9 6h11M9 12h11M9 18h11" /><circle cx="4.5" cy="6" r=".8" /><circle cx="4.5" cy="12" r=".8" /><circle cx="4.5" cy="18" r=".8" /></Icon>;
export const Heading = () => <Icon><path d="M6 4v16M18 4v16M6 12h12" /></Icon>;
export const Ban = () => <Icon><circle cx="12" cy="12" r="8.5" /><path d="M6 6l12 12" /></Icon>;
export const Bell = () => <Icon><path d="M6 16V11a6 6 0 0112 0v5l1.5 2h-15z" /><path d="M10 20.5a2 2 0 004 0" /></Icon>;
