import type { ReactNode } from "react";

// The tool's own icons: thin 24-unit strokes in the text's colour, drawn
// like a plan. Decorative (aria-hidden): every control that shows one also
// has words.
function Icon({ children }: { children: ReactNode }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{children}</svg>;
}

export const Week = () => <Icon><rect x="3.5" y="5" width="17" height="15" rx="1.5" /><path d="M3.5 10h17M8 3v4M16 3v4M8 14h2M14 14h2" /></Icon>;
export const Desk = () => <Icon><path d="M3 9h18M5 9v10M19 9v10M5 14h6M11 9v10" /><rect x="13" y="4" width="6" height="5" rx="0.5" /></Icon>;
export const Door = () => <Icon><path d="M4 20h16M6 20V4h10v16" /><path d="M16 4l3 1.5V20" /><circle cx="13" cy="12" r="0.8" fill="currentColor" /></Icon>;
export const People = () => <Icon><circle cx="9" cy="8.5" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0113 0M16 5.5a3.5 3.5 0 010 7M18 14.5a6.5 6.5 0 013.5 5.5" /></Icon>;
export const Plan = () => <Icon><rect x="3" y="3" width="18" height="18" rx="1" /><path d="M3 12h7M14 12h7M12 3v5M12 12v9" /></Icon>;
export const Building = () => <Icon><path d="M4 20V4h11v16M15 9h5v11M2.5 20h19M7.5 8h1M10.5 8h1M7.5 12h1M10.5 12h1M7.5 16h1M10.5 16h1M17.5 13h.5M17.5 16h.5" /></Icon>;
export const Laptop = () => <Icon><rect x="5" y="5" width="14" height="10" rx="1" /><path d="M2.5 19h19l-2-4h-15z" /></Icon>;
export const Moon = () => <Icon><path d="M19 14.5A7.5 7.5 0 019.5 5a7.5 7.5 0 109.5 9.5z" /></Icon>;
export const Plus = () => <Icon><path d="M12 5v14M5 12h14" /></Icon>;
export const Close = () => <Icon><path d="M6 6l12 12M18 6L6 18" /></Icon>;
export const Check = () => <Icon><path d="M5 12.5l4.5 4.5L19 7.5" /></Icon>;
export const Search = () => <Icon><circle cx="11" cy="11" r="6.5" /><path d="M20 20l-4.2-4.2" /></Icon>;
export const Left = () => <Icon><path d="M15 5l-7 7 7 7" /></Icon>;
export const Right = () => <Icon><path d="M9 5l7 7-7 7" /></Icon>;
export const Clock = () => <Icon><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></Icon>;
export const Repeat = () => <Icon><path d="M17 3l3 3-3 3M4 11V9a3 3 0 013-3h13M7 21l-3-3 3-3M20 13v2a3 3 0 01-3 3H4" /></Icon>;
export const Pencil = () => <Icon><path d="M4 20h4L19 9l-4-4L4 16z" /><path d="M13.5 6.5l4 4" /></Icon>;
export const Trash = () => <Icon><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" /></Icon>;
export const Download = () => <Icon><path d="M12 4v12M7 11l5 5 5-5M4 20h16" /></Icon>;
export const Upload = () => <Icon><path d="M12 16V4M7 9l5-5 5 5M4 16v4h16v-4" /></Icon>;
export const Badge = () => <Icon><rect x="5.5" y="6" width="13" height="15" rx="1.5" /><path d="M10 3.5h4V6h-4z" /><circle cx="12" cy="11.5" r="2" /><path d="M8.5 17.5a3.5 3.5 0 017 0" /></Icon>;
export const Pin = () => <Icon><path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0113 0c0 5.4-6.5 11-6.5 11z" /><circle cx="12" cy="10" r="2.3" /></Icon>;
export const Lock = () => <Icon><rect x="5" y="10.5" width="14" height="10" rx="1.5" /><path d="M8 10.5V7.5a4 4 0 018 0v3" /></Icon>;
export const CalendarAdd = () => <Icon><rect x="3.5" y="5" width="17" height="15" rx="1.5" /><path d="M3.5 10h17M8 3v4M16 3v4M12 12.5v5M9.5 15h5" /></Icon>;
export const Bolt = () => <Icon><path d="M13 3L5 13.5h6L10 21l8-10.5h-6z" /></Icon>;
export const Seat = () => <Icon><path d="M7 4h10v8H7zM5 12h14v3H5zM7 15v5M17 15v5" /></Icon>;

// Equipment and desk features.
export const Screen = () => <Icon><rect x="3" y="4" width="18" height="12" rx="1" /><path d="M9 20h6M12 16v4" /></Icon>;
export const Video = () => <Icon><rect x="3" y="6" width="12" height="12" rx="1.5" /><path d="M15 10.5l6-3.5v10l-6-3.5" /></Icon>;
export const Whiteboard = () => <Icon><rect x="3" y="4" width="18" height="12" rx="1" /><path d="M7 20l3-4M17 20l-3-4M7 12l3-3 2 2 4-4" /></Icon>;
export const Phone = () => <Icon><path d="M6 3.5h3l1.5 4.5-2 1.5a11 11 0 006 6l1.5-2 4.5 1.5v3A2 2 0 0118.5 20 15.5 15.5 0 014 5.5 2 2 0 016 3.5z" /></Icon>;
export const Accessible = () => <Icon><circle cx="11" cy="4.5" r="1.5" /><path d="M11 7.5v6h5l2 5M11 10.5h5M8 11.5a5 5 0 106.5 6.5" /></Icon>;
export const Dock = () => <Icon><rect x="4" y="13" width="16" height="6" rx="1" /><path d="M7 13V6h10v7M10 16h4" /></Icon>;
export const Standing = () => <Icon><path d="M4 8h16M7 8v12M17 8v12M9 14h6" /><path d="M12 4v4" /></Icon>;
export const Window = () => <Icon><rect x="4" y="3.5" width="16" height="17" rx="1" /><path d="M12 3.5v17M4 12h16" /></Icon>;
export const Quiet = () => <Icon><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" /><path d="M16 9.5l5 5M21 9.5l-5 5" /></Icon>;
