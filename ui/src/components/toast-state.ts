// The toasts as a pure state machine: what is shown, for how long, and
// what Undo may still do. The component (toast.tsx) only runs timers and
// feeds `now`, so every rule below is tested without a browser.
//
// The rules ("Undo that tells the truth", reports/05-critique/_store.md §2):
// - a toast waits while the pointer is on it or the keyboard is in it
//   (WCAG 2.2.1, timing adjustable), and gets at least `afterFocus` more
//   once the keyboard leaves it;
// - one toast per action id: showing the same id again replaces it;
// - a "sent" toast (an email or a bell item already left) never offers
//   Undo, even if one was passed; a toast turned into "sent" loses its Undo;
// - Undo runs once; the toast then says whether it worked;
// - when the time is up, Undo is gone with the toast: a person is never
//   offered an Undo that no longer works.

export type UndoResult = boolean | string | void;

export type ToastInput = {
  // Replaces the toast of the same id (one toast per action).
  readonly id?: string;
  readonly text: string;
  readonly tone?: "info" | "error";
  // Reverses the action. Resolves true/undefined when it worked, false (or
  // a sentence in the reader's language) when it did not.
  readonly undo?: () => UndoResult | Promise<UndoResult>;
  // The action already left the tool (an email, a notification): no Undo.
  readonly sent?: boolean;
  // One more thing to do about it, beside Undo (0.2.1): "Keep 1 min",
  // "Open", "Show". `run` is called once, then the toast goes (unless
  // `close: false`). Never a way to reverse the action: that is `undo`.
  readonly action?: ToastActionButton;
  // Milliseconds; the default depends on the kind (below).
  readonly duration?: number;
  // Called once when the toast goes and what it tells still stands: its
  // time is up, it was dismissed, replaced by a toast of the same id or
  // pushed out by newer ones, or its Undo did not work — never after an
  // Undo that worked (0.2.2). For an act done late (a delete sent to the
  // server only once its Undo can no longer be used). A page left before
  // (the tab closed) never calls it: such an act must be safe to lose.
  readonly onExpire?: () => void;
};

export type ToastActionButton = { readonly label: string; readonly run: () => void | Promise<void>; readonly close?: boolean };

export type ToastPhase = "open" | "undoing" | "undone" | "failed";

export type ToastState = {
  readonly id: string;
  readonly text: string;
  readonly tone: "info" | "error";
  readonly sent: boolean;
  readonly undo: (() => UndoResult | Promise<UndoResult>) | null;
  // The other button, while the toast is open.
  readonly action?: ToastActionButton | null;
  // What to call when it goes and its act stands (ToastInput.onExpire).
  readonly onExpire?: (() => void) | null;
  readonly phase: ToastPhase;
  // The message shown after an Undo (failed: the tool's words or the kit's).
  readonly note: string | null;
  // When it goes (ms since epoch); null while paused.
  readonly deadline: number | null;
  // Time left when paused.
  readonly remaining: number;
  readonly hover: boolean;
  readonly focus: boolean;
  // Was the keyboard in it at some point? (it then gets `afterFocus`).
  readonly reached: boolean;
  readonly seq: number;
};

export const durations = {
  info: 6000,
  withUndo: 10000,
  error: 10000,
  afterFocus: 6000,
  afterUndo: 4000,
  max: 3,
} as const;

export type ToastAction =
  | { type: "show"; input: ToastInput; now: number; seq: number }
  | { type: "hover"; id: string; on: boolean; now: number }
  | { type: "focus"; id: string; on: boolean; now: number }
  | { type: "expire"; id: string; now: number }
  | { type: "dismiss"; id: string }
  | { type: "undoStart"; id: string }
  | { type: "undoEnd"; id: string; ok: boolean; note: string | null; now: number };

function lengthOf(input: ToastInput, canUndo: boolean): number {
  if (input.duration !== undefined && input.duration > 0) return input.duration;
  if (input.tone === "error") return durations.error;
  return canUndo ? durations.withUndo : durations.info;
}

function pause(t: ToastState, now: number): ToastState {
  if (t.deadline === null) return t;
  return { ...t, deadline: null, remaining: Math.max(0, t.deadline - now) };
}

function resume(t: ToastState, now: number): ToastState {
  if (t.hover || t.focus || t.deadline !== null) return t;
  const remaining = t.reached ? Math.max(t.remaining, durations.afterFocus) : t.remaining;
  return { ...t, deadline: now + remaining, remaining };
}

export function toastReducer(state: readonly ToastState[], action: ToastAction): ToastState[] {
  switch (action.type) {
    case "show": {
      const { input, now, seq } = action;
      const sent = input.sent === true;
      const undo = !sent && input.undo ? input.undo : null;
      const id = input.id ?? `toast-${seq}`;
      const button = input.action && input.action.label.trim() !== "" ? input.action : null;
      // A button to reach needs the longer time, as Undo does.
      const length = lengthOf(input, undo !== null || button !== null);
      const previous = state.find(t => t.id === id);
      const fresh: ToastState = {
        id,
        text: input.text,
        tone: input.tone ?? "info",
        sent,
        undo,
        action: button,
        onExpire: input.onExpire ?? null,
        phase: "open",
        note: null,
        deadline: now + length,
        remaining: length,
        hover: previous?.hover ?? false,
        focus: previous?.focus ?? false,
        reached: previous?.reached ?? false,
        seq,
      };
      const placed = previous && (previous.hover || previous.focus) ? pause(fresh, now) : fresh;
      const others = state.filter(t => t.id !== id);
      const list = [...others, placed];
      // At most `max` at once: the oldest the person is not using goes.
      while (list.length > durations.max) {
        const i = list.findIndex(t => !t.hover && !t.focus);
        list.splice(i >= 0 ? i : 0, 1);
      }
      return list;
    }
    case "hover":
    case "focus": {
      return state.map(t => {
        if (t.id !== action.id) return t;
        const flagged: ToastState = action.type === "hover" ? { ...t, hover: action.on } : { ...t, focus: action.on, reached: t.reached || action.on };
        return action.on ? pause(flagged, action.now) : resume(flagged, action.now);
      });
    }
    case "expire": {
      // A timer that fired late for a toast paused meanwhile does nothing.
      return state.filter(t => t.id !== action.id || t.deadline === null || t.deadline > action.now || t.phase === "undoing");
    }
    case "dismiss":
      return state.filter(t => t.id !== action.id);
    case "undoStart":
      return state.map(t => (t.id === action.id && t.undo && t.phase === "open" ? { ...t, phase: "undoing", deadline: null, remaining: 0 } : t));
    case "undoEnd": {
      return state.map(t => {
        if (t.id !== action.id || t.phase !== "undoing") return t;
        const length = action.ok ? durations.afterUndo : durations.error;
        // The pointer that pressed Undo no longer holds it (0.2.6): the
        // button is gone and the toast shrinks, often from under a pointer
        // that then leaves without the toast being told — it waited for
        // ever. A pointer that moves on it again holds it again.
        const next: ToastState = { ...t, phase: action.ok ? "undone" : "failed", undo: null, action: null, note: action.note, deadline: action.now + length, remaining: length, hover: false };
        return next.focus ? pause(next, action.now) : next;
      });
    }
    default:
      return [...state];
  }
}

// latestUndo: the toast whose Undo a keyboard shortcut (Ctrl+Z / ⌘Z,
// outside a text field) would run: the newest still offering one.
export function latestUndo(state: readonly ToastState[]): ToastState | null {
  for (let i = state.length - 1; i >= 0; i--) {
    const t = state[i]!;
    if (t.undo && t.phase === "open") return t;
  }
  return null;
}

// expired: the toasts of `before` gone from `after` whose act still
// stands (none undone): their onExpire is due. A toast replaced by another
// of the same id counts as gone (the newer one has another seq).
export function expired(before: readonly ToastState[], after: readonly ToastState[]): ToastState[] {
  const still = new Set(after.map(t => `${t.id}#${t.seq}`));
  return before.filter(t => !still.has(`${t.id}#${t.seq}`) && t.onExpire && t.phase !== "undone" && t.phase !== "undoing");
}

// settle turns what an undo function gave into ok + note.
export function settleUndo(result: UndoResult): { ok: boolean; note: string | null } {
  if (result === false) return { ok: false, note: null };
  if (typeof result === "string") return { ok: false, note: result };
  return { ok: true, note: null };
}

// byKeyboard: is this element's focus the keyboard's (0.2.6)? A toast
// waits while the keyboard is in it, not while a click or a tap left the
// focus on one of its buttons (Chromium focuses a clicked button): that
// held a toast on screen until the person clicked elsewhere. The browser
// knows (`:focus-visible`); one that cannot tell counts it as keyboard,
// the safe side for whoever reads with it.
export function byKeyboard(target: unknown): boolean {
  const el = target as { matches?: (selector: string) => boolean } | null;
  if (!el || typeof el.matches !== "function") return false;
  try {
    return el.matches(":focus-visible");
  } catch {
    return true;
  }
}

// The custom property that lifts the toasts (css/components.css reads it
// on .ck-toasts); <Toasts> sets it to bottomBarLift's answer, a tool may
// set it on an ancestor itself.
export const bottomBarProperty = "--ck-bottom-bar";

// What bottomBarLift reads of the page: the marked bars' boxes.
type BarBox = { top: number; bottom: number; width: number; height: number };
type BarPage = { querySelectorAll: (selector: string) => ArrayLike<{ getBoundingClientRect: () => BarBox }> };

// bottomBarLift: how far toasts rise to clear a phone's bottom bar (0.2.6)
// — the height, from the screen's bottom edge, of the highest bar marked
// `data-ck-bottom-bar` that is shown and touches that edge (a bar that
// has scrolled away, or is hidden on a desk, lifts nothing). Whole pixels.
export function bottomBarLift(page: BarPage, viewportHeight: number): number {
  let lift = 0;
  const bars = page.querySelectorAll("[data-ck-bottom-bar]");
  for (let i = 0; i < bars.length; i++) {
    const r = bars[i]!.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    if (r.bottom < viewportHeight - 2 || r.top >= viewportHeight) continue;
    lift = Math.max(lift, viewportHeight - r.top);
  }
  return Math.ceil(lift);
}
