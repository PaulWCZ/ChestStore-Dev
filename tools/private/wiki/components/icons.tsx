import type { ReactNode } from "react";

// The wiki's own icons: fine 24-unit strokes in the text's colour, drawn
// like a pen line. Decorative (aria-hidden): every control that shows one
// also has words, visible or for screen readers.
function Icon({ children }: { children: ReactNode }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{children}</svg>;
}

export const Plus = () => <Icon><path d="M12 5v14M5 12h14" /></Icon>;
export const Check = () => <Icon><path d="M5 12.5l4.5 4.5L19 7.5" /></Icon>;
export const Close = () => <Icon><path d="M6 6l12 12M18 6L6 18" /></Icon>;
export const Search = () => <Icon><circle cx="11" cy="11" r="6.5" /><path d="M20 20l-4.2-4.2" /></Icon>;
export const Menu = () => <Icon><path d="M4 7h16M4 12h16M4 17h10" /></Icon>;
export const Chevron = () => <Icon><path d="M9.5 6l6 6-6 6" /></Icon>;
export const Back = () => <Icon><path d="M15 5l-7 7 7 7" /></Icon>;
export const Dots = () => <Icon><circle cx="5" cy="12" r="1.2" /><circle cx="12" cy="12" r="1.2" /><circle cx="19" cy="12" r="1.2" /></Icon>;
export const Pen = () => <Icon><path d="M15.5 4.5l4 4L8 20H4v-4z" /><path d="M13 7l4 4" /></Icon>;
export const Clock = () => <Icon><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></Icon>;
export const Trash = () => <Icon><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" /></Icon>;
export const Restore = () => <Icon><path d="M4 12a8 8 0 108-8 8.5 8.5 0 00-6 2.5L4 8.5M4 4v4.5h4.5" /></Icon>;
export const Move = () => <Icon><path d="M4 12h12M12 8l4 4-4 4M20 5v14" /></Icon>;
export const Download = () => <Icon><path d="M12 4v12M7 11l5 5 5-5M4 20h16" /></Icon>;
export const Upload = () => <Icon><path d="M12 16V4M7 9l5-5 5 5M4 16v4h16v-4" /></Icon>;
export const Printer = () => <Icon><path d="M7 9V4h10v5M7 17H4v-7h16v7h-3" /><path d="M7 14h10v6H7z" /></Icon>;
export const Home = () => <Icon><path d="M4 11l8-6.5 8 6.5M6 9.5V20h12V9.5" /></Icon>;
export const Gear = () => <Icon><path d="M4 7h10M18 7h2M4 17h4M12 17h8" /><circle cx="16" cy="7" r="2" /><circle cx="10" cy="17" r="2" /></Icon>;
export const Lock = () => <Icon><rect x="5" y="10.5" width="14" height="10" rx="2" /><path d="M8 10.5V7.5a4 4 0 018 0v3" /></Icon>;
export const Page = () => <Icon><path d="M6 3h8l4 4v14H6z" /><path d="M14 3v4h4M9 12h6M9 16h6" /></Icon>;
export const Book = () => <Icon><path d="M12 6.5C9.5 5 6.5 4.6 3.5 5v13c3-.4 6 0 8.5 1.5M12 6.5C14.5 5 17.5 4.6 20.5 5v13c-3-.4-6 0-8.5 1.5M12 6.5v13" /></Icon>;
export const Bold = () => <Icon><path d="M7 5h6a3.5 3.5 0 010 7H7zM7 12h7a3.5 3.5 0 010 7H7z" strokeWidth="2.2" /></Icon>;
export const Italic = () => <Icon><path d="M14 5h-4M14 19h-4M13 5l-2 14" strokeWidth="2" /></Icon>;
export const Strike = () => <Icon><path d="M5 12h14M16 7.5C15.4 6 14 5 12 5c-2.5 0-4 1.3-4 3.2 0 1.3.8 2.3 2.5 2.8M8 16.5C8.6 18 10 19 12 19c2.5 0 4-1.3 4-3.2" /></Icon>;
export const Code = () => <Icon><path d="M9 7l-5 5 5 5M15 7l5 5-5 5" /></Icon>;
export const Link = () => <Icon><path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1" /></Icon>;
export const PageLink = () => <Icon><path d="M6 3h8l4 4v5M14 3v4h4M6 3v18h5" /><path d="M14.5 18.5a2 2 0 002.8 0l1.7-1.7a2 2 0 00-2.8-2.8M19.5 15.5" /><path d="M17 16.5a2 2 0 00-2.8 0l-1.7 1.7a2 2 0 002.8 2.8" /></Icon>;
export const Bullets = () => <Icon><path d="M9 6h11M9 12h11M9 18h11" /><circle cx="4.5" cy="6" r="1" /><circle cx="4.5" cy="12" r="1" /><circle cx="4.5" cy="18" r="1" /></Icon>;
export const Numbers = () => <Icon><path d="M10 6h10M10 12h10M10 18h10M4 5l1.5-1v5M3.8 13.5a1.4 1.4 0 012.4 1c0 1-2.4 2-2.4 3h2.6" /></Icon>;
export const CheckList = () => <Icon><rect x="3.5" y="4.5" width="5" height="5" rx="1" /><path d="M4.8 16l1.3 1.3 2.4-2.6M11 7h9M11 16h9" /></Icon>;
export const Quote = () => <Icon><path d="M5 18c2-1 3-3 3-5.5V7H4v5h4M15 18c2-1 3-3 3-5.5V7h-4v5h4" /></Icon>;
export const Note = () => <Icon><rect x="3.5" y="4.5" width="17" height="15" rx="2.5" /><path d="M12 9v.01M12 12v4" /></Icon>;
export const Table = () => <Icon><rect x="3.5" y="4.5" width="17" height="15" rx="1.5" /><path d="M3.5 9.5h17M3.5 14.5h17M10 4.5v15" /></Icon>;
export const Image = () => <Icon><rect x="3.5" y="4.5" width="17" height="15" rx="2" /><circle cx="9" cy="10" r="1.6" /><path d="M20.5 16l-5-5-8 8.5" /></Icon>;
export const Divider = () => <Icon><path d="M3 12h18M7 7h10M7 17h10" strokeOpacity="0.5" /></Icon>;
export const Undo = () => <Icon><path d="M9 14L4 9l5-5" /><path d="M4 9h10.5a5.5 5.5 0 010 11H11" /></Icon>;
export const Redo = () => <Icon><path d="M15 14l5-5-5-5" /><path d="M20 9H9.5a5.5 5.5 0 000 11H13" /></Icon>;
export const Folder = () => <Icon><path d="M3.5 6.5a1.5 1.5 0 011.5-1.5h4.5l2 2.5H19a1.5 1.5 0 011.5 1.5v8.5A1.5 1.5 0 0119 19H5a1.5 1.5 0 01-1.5-1.5z" /></Icon>;
export const People = () => <Icon><circle cx="9" cy="8.5" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0113 0M16 5.5a3.5 3.5 0 010 7M18 14.5a6.5 6.5 0 013.5 5.5" /></Icon>;
export const Eye = () => <Icon><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" /><circle cx="12" cy="12" r="3" /></Icon>;
export const Chat = () => <Icon><path d="M4.5 5.5h15v10h-9l-4.5 3.5v-3.5H4.5z" /></Icon>;
export const Stamp = () => <Icon><path d="M8 3.5h10.5V16M5.5 6.5h10v14h-10z" /><path d="M8.5 11h4M8.5 14.5h4" /></Icon>;
export const Calendar = () => <Icon><rect x="3.5" y="5" width="17" height="15" rx="2" /><path d="M3.5 9.5h17M8 3v4M16 3v4M9 14.5l2 2 4-4" /></Icon>;
export const Heading = () => <Icon><path d="M6 5v14M16 5v14M6 12h10M19 19h2" /></Icon>;
export const Pin = () => <Icon><path d="M9 4h6l-1 5 3 3H7l3-3-1-5zM12 12v8" /></Icon>;
export const Seal = () => <Icon><path d="M12 3l2.2 1.6 2.7-.2.9 2.6 2.2 1.6-.8 2.6.8 2.6-2.2 1.6-.9 2.6-2.7-.2L12 21l-2.2-1.6-2.7.2-.9-2.6L4 15.4l.8-2.6L4 10.2l2.2-1.6.9-2.6 2.7.2z" /><path d="M9 12l2 2 4-4" /></Icon>;
