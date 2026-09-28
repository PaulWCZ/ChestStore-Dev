import type { ReactNode } from "react";

// The tool's own icons: simple 24-unit strokes in the text's colour.
// Decorative (aria-hidden): every control that shows one also has words.
function Icon({ children }: { children: ReactNode }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{children}</svg>;
}

export const Plus = () => <Icon><path d="M12 5v14M5 12h14" /></Icon>;
export const Check = () => <Icon><path d="M5 12.5l4.5 4.5L19 7.5" /></Icon>;
export const Close = () => <Icon><path d="M6 6l12 12M18 6L6 18" /></Icon>;
export const Calendar = () => <Icon><rect x="3.5" y="5" width="17" height="15" rx="2" /><path d="M3.5 10h17M8 3v4M16 3v4" /></Icon>;
export const Chat = () => <Icon><path d="M4 5h16v11H9l-5 4z" /></Icon>;
export const Clip = () => <Icon><path d="M20 11.5l-7.8 7.8a5 5 0 01-7-7L13 4.5a3.3 3.3 0 014.7 4.7l-7.8 7.7a1.7 1.7 0 01-2.3-2.3l7-7" /></Icon>;
export const ListIcon = () => <Icon><path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01" /></Icon>;
export const Columns = () => <Icon><rect x="3.5" y="4" width="5" height="16" rx="1.5" /><rect x="10.5" y="4" width="5" height="11" rx="1.5" /><rect x="17.5" y="4" width="3" height="7" rx="1" /></Icon>;
export const Gear = () => <Icon><path d="M4 7h10M18 7h2M4 17h4M12 17h8" /><circle cx="16" cy="7" r="2" /><circle cx="10" cy="17" r="2" /></Icon>;
export const Search = () => <Icon><circle cx="11" cy="11" r="6.5" /><path d="M20 20l-4.2-4.2" /></Icon>;
export const Archive = () => <Icon><rect x="3" y="4" width="18" height="5" rx="1" /><path d="M5 9v10h14V9M10 13h4" /></Icon>;
export const Back = () => <Icon><path d="M15 5l-7 7 7 7" /></Icon>;
export const Dots = () => <Icon><circle cx="5" cy="12" r="1.3" /><circle cx="12" cy="12" r="1.3" /><circle cx="19" cy="12" r="1.3" /></Icon>;
export const Lock = () => <Icon><rect x="5" y="10.5" width="14" height="10" rx="2" /><path d="M8 10.5V7.5a4 4 0 018 0v3" /></Icon>;
export const Home = () => <Icon><path d="M4 11l8-6.5 8 6.5M6 9.5V20h12V9.5" /></Icon>;
export const Grid = () => <Icon><rect x="4" y="4" width="7" height="7" rx="1.5" /><rect x="13" y="4" width="7" height="7" rx="1.5" /><rect x="4" y="13" width="7" height="7" rx="1.5" /><rect x="13" y="13" width="7" height="7" rx="1.5" /></Icon>;
export const Upload = () => <Icon><path d="M12 16V4M7 9l5-5 5 5M4 16v4h16v-4" /></Icon>;
export const Download = () => <Icon><path d="M12 4v12M7 11l5 5 5-5M4 20h16" /></Icon>;
export const File = () => <Icon><path d="M6 3h8l4 4v14H6z" /><path d="M14 3v4h4" /></Icon>;
export const Tag = () => <Icon><path d="M3.5 12.5V4h8.5l8.5 8.5-8.5 8.5z" /><circle cx="8" cy="8.5" r="1.3" /></Icon>;
export const People = () => <Icon><circle cx="9" cy="8.5" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0113 0M16 5.5a3.5 3.5 0 010 7M18 14.5a6.5 6.5 0 013.5 5.5" /></Icon>;
export const CheckList = () => <Icon><path d="M4 7l1.5 1.5L8.5 5.5M4 13.5l1.5 1.5 3-3M11 7h9M11 14h9M11 19h9" /></Icon>;
export const Text = () => <Icon><path d="M4 6h16M4 11h16M4 16h10" /></Icon>;
export const Clock = () => <Icon><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></Icon>;
export const Arrow = () => <Icon><path d="M5 12h14M13 6l6 6-6 6" /></Icon>;
export const Restore = () => <Icon><path d="M4 12a8 8 0 108-8 8.5 8.5 0 00-6 2.5L4 8.5M4 4v4.5h4.5" /></Icon>;
export const Trash = () => <Icon><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" /></Icon>;
export const Phone = () => <Icon><path d="M5 4h4l2 5-2.5 1.5a11 11 0 005 5L15 13l5 2v4a1 1 0 01-1 1A16 16 0 014 5a1 1 0 011-1z" /></Icon>;
export const Pin = () => <Icon><path d="M12 21s-6.5-6-6.5-11a6.5 6.5 0 0113 0c0 5-6.5 11-6.5 11z" /><circle cx="12" cy="10" r="2.3" /></Icon>;
export const Cake = () => <Icon><path d="M4 20h16M5 20v-7h14v7M8 13V10M12 13V10M16 13V10" /><path d="M8 7.5c0-1 .8-1.6.8-2.5M12 7.5c0-1 .8-1.6.8-2.5M16 7.5c0-1 .8-1.6.8-2.5" /></Icon>;
export const Star = () => <Icon><path d="M12 4l2.4 5 5.4.6-4 3.7 1.1 5.3L12 16l-4.9 2.6 1.1-5.3-4-3.7 5.4-.6z" /></Icon>;
export const Wave = () => <Icon><path d="M7 11V6.5a1.5 1.5 0 013 0V11M10 10V5a1.5 1.5 0 013 0v6M13 10.5V6.5a1.5 1.5 0 013 0V13c0 4-2.5 7-6 7-2.5 0-4-1.5-5.5-4L3 13a1.5 1.5 0 012.5-1.5L7 13" /></Icon>;
export const Tree = () => <Icon><rect x="9" y="3" width="6" height="5" rx="1.5" /><rect x="3" y="16" width="6" height="5" rx="1.5" /><rect x="15" y="16" width="6" height="5" rx="1.5" /><path d="M12 8v4M6 16v-4h12v4" /></Icon>;
export const Chevron = () => <Icon><path d="M9 6l6 6-6 6" /></Icon>;
export const ChevronDown = () => <Icon><path d="M6 9l6 6 6-6" /></Icon>;
export const Pencil = () => <Icon><path d="M4 20l1-4.5L15.5 5a2.1 2.1 0 013 3L8 18.5z" /><path d="M13.5 7l3 3" /></Icon>;
export const Clipboard = () => <Icon><rect x="5" y="4.5" width="14" height="16" rx="2" /><path d="M9 4.5V3h6v1.5M9 11l2 2 4-4M9 17h6" /></Icon>;
export const Door = () => <Icon><path d="M4 20h16M6 20V4h9v16M15 6h3v14" /><circle cx="12" cy="12" r=".8" /></Icon>;
export const Sparkle = () => <Icon><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M6 18l2.5-2.5M15.5 8.5L18 6" /></Icon>;
