// The few icons the kit's components draw: 24-unit strokes in the text's
// colour (currentColor), decorative (the words beside them say what they
// mean). A tool keeps its own icons for its pages.
import type { ReactElement, ReactNode } from "react";

function Icon({ children, className }: { children: ReactNode; className?: string | undefined }): ReactElement {
  return (
    <svg className={className ? `ck-icon ${className}` : "ck-icon"} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {children}
    </svg>
  );
}

export const CloseIcon = () => <Icon><path d="M6 6l12 12M18 6L6 18" /></Icon>;
export const CheckIcon = () => <Icon><path d="M5 12.5l4.5 4.5L19 7.5" /></Icon>;
export const ChevronLeft = () => <Icon><path d="M15 5l-7 7 7 7" /></Icon>;
export const ChevronRight = () => <Icon><path d="M9 5l7 7-7 7" /></Icon>;
export const ChevronDown = () => <Icon><path d="M5 9l7 7 7-7" /></Icon>;
export const CalendarIcon = () => <Icon><rect x="3.5" y="5" width="17" height="15.5" rx="2" /><path d="M3.5 10h17M8 3v4M16 3v4" /></Icon>;
export const SearchIcon = () => <Icon><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4.5 4.5" /></Icon>;
export const MoreIcon = () => <Icon><circle cx="5" cy="12" r="1.2" fill="currentColor" /><circle cx="12" cy="12" r="1.2" fill="currentColor" /><circle cx="19" cy="12" r="1.2" fill="currentColor" /></Icon>;
export const FileIcon = () => <Icon><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /></Icon>;
export const UploadIcon = () => <Icon><path d="M12 16V4M7 9l5-5 5 5" /><path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" /></Icon>;
export const CameraIcon = () => <Icon><path d="M3.5 8.5a2 2 0 0 1 2-2h2.2l1.6-2.5h5.4l1.6 2.5h2.2a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z" /><circle cx="12" cy="13" r="3.5" /></Icon>;
export const UndoIcon = () => <Icon><path d="M9 14L4 9l5-5" /><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" /></Icon>;
export const SentIcon = () => <Icon><path d="M21 3L10 14" /><path d="M21 3l-7 18-4-7-7-4z" /></Icon>;
export const AlertIcon = () => <Icon><path d="M12 3l10 18H2z" /><path d="M12 10v5M12 18v.01" /></Icon>;
export const GroupIcon = () => <Icon><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0" /><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6.5 6.5 0 0 1 3.5 6" /></Icon>;
export const SortIcon = ({ dir }: { dir: "asc" | "desc" | "none" }) => (
  <Icon className={`ck-sort-${dir}`}>
    <path className="ck-sort-up" d="M8 10l4-4 4 4" />
    <path className="ck-sort-down" d="M8 14l4 4 4-4" />
  </Icon>
);

// The state shapes: a state is never told by colour alone, so each has its
// own shape (a filled disc with a tick, a clock, a cross in a square, a
// diamond, a hollow circle).
export function StateIcon({ tone }: { tone: "ok" | "wait" | "danger" | "info" | "neutral" }): ReactElement {
  switch (tone) {
    case "ok": return <Icon className="ck-state-icon"><circle cx="12" cy="12" r="9" /><path d="M8 12.5l3 3 5-6" /></Icon>;
    case "wait": return <Icon className="ck-state-icon"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></Icon>;
    case "danger": return <Icon className="ck-state-icon"><rect x="3.5" y="3.5" width="17" height="17" rx="2" /><path d="M9 9l6 6M15 9l-6 6" /></Icon>;
    case "info": return <Icon className="ck-state-icon"><path d="M12 2.5l9.5 9.5-9.5 9.5L2.5 12z" /><path d="M12 11v5M12 8v.01" /></Icon>;
    default: return <Icon className="ck-state-icon"><circle cx="12" cy="12" r="8" /></Icon>;
  }
}
