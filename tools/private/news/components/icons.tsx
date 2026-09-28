import type { ReactNode } from "react";

// Icons drawn for News on a 24-unit grid, 2-unit strokes, round ends. They
// take their text's size and colour; each is decorative (aria-hidden): a
// word is always beside it, or in a visually hidden label.
function Icon({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {children}
    </svg>
  );
}

export const Megaphone = () => <Icon><path d="M3 10v4h3l7 4V6L6 10H3z" /><path d="M17 9a4 4 0 0 1 0 6" /><path d="M7 14l1 5h3" /></Icon>;
export const Calendar = () => <Icon><rect x="3.5" y="5" width="17" height="15" rx="1" /><path d="M3.5 10h17M8 3v4M16 3v4" /></Icon>;
export const Wave = () => <Icon><path d="M8 13V6.5a1.5 1.5 0 0 1 3 0V12" /><path d="M11 11V4.5a1.5 1.5 0 0 1 3 0V11" /><path d="M14 11V6.5a1.5 1.5 0 0 1 3 0V14a7 7 0 0 1-12.6 4.2L2.6 15a1.6 1.6 0 0 1 2.5-2l2.9 2.5" /></Icon>;
export const Info = () => <Icon><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7.5v.01" /></Icon>;
export const Pin = () => <Icon><path d="M9 3h6l-1 6 4 4H6l4-4-1-6z" /><path d="M12 13v8" /></Icon>;
export const Place = () => <Icon><path d="M12 21s7-6.2 7-11.5a7 7 0 1 0-14 0C5 14.8 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.5" /></Icon>;
export const Clock = () => <Icon><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></Icon>;
export const Clip = () => <Icon><path d="M20 11.5l-8.2 8.2a5 5 0 0 1-7-7L13 4.5a3.3 3.3 0 0 1 4.7 4.7l-8.2 8.2a1.7 1.7 0 0 1-2.4-2.4l7.6-7.6" /></Icon>;
export const Download = () => <Icon><path d="M12 4v11M7 10l5 5 5-5M5 20h14" /></Icon>;
export const Speech = () => <Icon><path d="M4 5h16v11H9l-5 4z" /></Icon>;
export const Check = () => <Icon><path d="M5 12.5l4.5 4.5L19 7.5" /></Icon>;
export const Cross = () => <Icon><path d="M6 6l12 12M18 6L6 18" /></Icon>;
export const Plus = () => <Icon><path d="M12 5v14M5 12h14" /></Icon>;
export const Pen = () => <Icon><path d="M4 20l1-4L16.5 4.5a2.1 2.1 0 0 1 3 3L8 19z" /><path d="M14 7l3 3" /></Icon>;
export const Trash = () => <Icon><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" /></Icon>;
export const Back = () => <Icon><path d="M19 12H5M11 6l-6 6 6 6" /></Icon>;
export const Picture = () => <Icon><rect x="3" y="4" width="18" height="16" rx="1" /><circle cx="9" cy="10" r="2" /><path d="M21 16l-5-5L5 20" /></Icon>;
export const Bold = () => <Icon><path d="M7 5h6a3.5 3.5 0 0 1 0 7H7zM7 12h7a3.5 3.5 0 0 1 0 7H7z" /></Icon>;
export const Italic = () => <Icon><path d="M10 5h8M6 19h8M14 5l-4 14" /></Icon>;
export const List = () => <Icon><path d="M9 6h11M9 12h11M9 18h11" /><circle cx="4.5" cy="6" r="1" /><circle cx="4.5" cy="12" r="1" /><circle cx="4.5" cy="18" r="1" /></Icon>;
export const LinkIcon = () => <Icon><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></Icon>;
export const Bell = () => <Icon><path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z" /><path d="M10 20a2 2 0 0 0 4 0" /></Icon>;
export const Alarm = () => <Icon><path d="M12 3l9.5 17h-19z" /><path d="M12 10v4M12 17v.01" /></Icon>;

export const kindIcons = { announcement: Megaphone, event: Calendar, welcome: Wave, info: Info } as const;
