import type { ReactNode } from "react";

// The tool's own icons: thin 24-unit strokes in the text's colour, square
// joins for a technical feel. Decorative (aria-hidden): every control that
// shows one also has words, visible or for screen readers.
function Icon({ children }: { children: ReactNode }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{children}</svg>;
}

export const Today = () => <Icon><rect x="3.5" y="5" width="17" height="15" rx="1.5" /><path d="M3.5 10h17M8 3v4M16 3v4" /><path d="M9 14.5l2 2 4-4" /></Icon>;
export const Pipeline = () => <Icon><rect x="3.5" y="4" width="4.5" height="16" rx="1" /><rect x="9.75" y="4" width="4.5" height="11" rx="1" /><rect x="16" y="4" width="4.5" height="6.5" rx="1" /></Icon>;
export const Building = () => <Icon><path d="M4 20V5.5L12 3v17M12 8.5l8 2.5v9M2.5 20h19M7 8h2M7 11.5h2M7 15h2M15 13h2M15 16.5h2" /></Icon>;
export const Person = () => <Icon><circle cx="12" cy="8" r="4" /><path d="M4.5 20.5a7.5 7.5 0 0115 0" /></Icon>;
export const Search = () => <Icon><circle cx="11" cy="11" r="6.5" /><path d="M20 20l-4.2-4.2" /></Icon>;
export const Plus = () => <Icon><path d="M12 5v14M5 12h14" /></Icon>;
export const Check = () => <Icon><path d="M5 12.5l4.5 4.5L19 7.5" /></Icon>;
export const Close = () => <Icon><path d="M6 6l12 12M18 6L6 18" /></Icon>;
export const Phone = () => <Icon><path d="M5 4h3.5l1.5 4.5-2 1.5a11 11 0 006 6l1.5-2 4.5 1.5V19a1.5 1.5 0 01-1.5 1.5A16.5 16.5 0 013.5 5.5 1.5 1.5 0 015 4z" /></Icon>;
export const Mail = () => <Icon><rect x="3" y="5.5" width="18" height="13" rx="1.5" /><path d="M3.5 6.5l8.5 6.5 8.5-6.5" /></Icon>;
export const Meeting = () => <Icon><circle cx="8" cy="8.5" r="3" /><circle cx="16.5" cy="8.5" r="3" /><path d="M2.5 19a5.5 5.5 0 0111 0M11 19a5.5 5.5 0 0111 0" /></Icon>;
export const Note = () => <Icon><path d="M5 3.5h10l4 4v13H5z" /><path d="M14.5 3.5v4.5H19M8.5 12h7M8.5 15.5h7" /></Icon>;
export const Flag = () => <Icon><path d="M5 21V4M5 4.5h12l-2.5 4 2.5 4H5" /></Icon>;
export const Trophy = () => <Icon><path d="M8 4h8v5a4 4 0 01-8 0zM8 6H4.5a3.5 3.5 0 003.7 4.5M16 6h3.5a3.5 3.5 0 01-3.7 4.5M12 13v4M8.5 20.5h7M9.5 17h5v3.5h-5z" /></Icon>;
export const Lost = () => <Icon><circle cx="12" cy="12" r="8.5" /><path d="M9 9l6 6M15 9l-6 6" /></Icon>;
export const Clock = () => <Icon><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></Icon>;
export const Dots = () => <Icon><circle cx="5" cy="12" r="1.2" /><circle cx="12" cy="12" r="1.2" /><circle cx="19" cy="12" r="1.2" /></Icon>;
export const Back = () => <Icon><path d="M15 5l-7 7 7 7" /></Icon>;
export const Next = () => <Icon><path d="M9 5l7 7-7 7" /></Icon>;
export const Up = () => <Icon><path d="M6 15l6-6 6 6" /></Icon>;
export const Down = () => <Icon><path d="M6 9l6 6 6-6" /></Icon>;
export const Download = () => <Icon><path d="M12 4v11M7.5 10.5L12 15l4.5-4.5M4 20h16" /></Icon>;
export const Upload = () => <Icon><path d="M12 16V5M7.5 9.5L12 5l4.5 4.5M4 20h16" /></Icon>;
export const Gear = () => <Icon><path d="M4 7h9M17 7h3M4 17h3M11 17h9" /><circle cx="15" cy="7" r="2" /><circle cx="9" cy="17" r="2" /></Icon>;
export const Trash = () => <Icon><path d="M4 6.5h16M9.5 6.5V4h5v2.5M6.5 6.5l1 14h9l1-14M10 10.5v6M14 10.5v6" /></Icon>;
export const Pencil = () => <Icon><path d="M4 20l1-4.5L16 4.5l3.5 3.5-11 11zM13.5 7l3.5 3.5" /></Icon>;
export const Globe = () => <Icon><circle cx="12" cy="12" r="8.5" /><path d="M3.5 12h17M12 3.5c2.5 2.7 2.5 14.3 0 17M12 3.5c-2.5 2.7-2.5 14.3 0 17" /></Icon>;
export const Pin = () => <Icon><path d="M12 21s6.5-6.2 6.5-11a6.5 6.5 0 00-13 0c0 4.8 6.5 11 6.5 11z" /><circle cx="12" cy="10" r="2.3" /></Icon>;
export const Tag = () => <Icon><path d="M3.5 12.5V4h8.5l8.5 8.5-8.5 8.5z" /><circle cx="8" cy="8.5" r="1.3" /></Icon>;
export const ListIcon = () => <Icon><path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01" /></Icon>;
export const Card = () => <Icon><rect x="3" y="5" width="18" height="14" rx="1.5" /><circle cx="8.5" cy="11" r="2" /><path d="M5.5 16a3 3 0 016 0M14 10h4M14 13.5h4" /></Icon>;
export const Shield = () => <Icon><path d="M12 3l7.5 3v5.5c0 4.5-3.2 8.2-7.5 9.5-4.3-1.3-7.5-5-7.5-9.5V6z" /></Icon>;
export const Spark = () => <Icon><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M18 6l-2.5 2.5M8.5 15.5L6 18" /></Icon>;
export const Undo = () => <Icon><path d="M9 7L4.5 11.5 9 16M5 11.5h9.5a5 5 0 010 10H12" /></Icon>;
export const Merge = () => <Icon><path d="M6 3.5v4a5 5 0 005 5h1a5 5 0 015 5v3" /><path d="M18 3.5v4a5 5 0 01-2.5 4.3" /><path d="M14 18l3 3 3-3" /></Icon>;
export const Chart = () => <Icon><path d="M4 20V4M4 20h16" /><rect x="7" y="11" width="3" height="6" /><rect x="12" y="7" width="3" height="10" /><rect x="17" y="13" width="3" height="4" /></Icon>;
export const Paperclip = () => <Icon><path d="M20 11.5l-8.2 8.2a5 5 0 01-7.1-7.1l8.5-8.5a3.3 3.3 0 014.7 4.7l-8.3 8.3a1.7 1.7 0 01-2.4-2.4l7.6-7.6" /></Icon>;
export const Sliders = () => <Icon><path d="M4 7h9M17 7h3M4 17h3M11 17h9" /><circle cx="15" cy="7" r="2" /><circle cx="9" cy="17" r="2" /></Icon>;
