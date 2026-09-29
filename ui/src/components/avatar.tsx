// Avatar: a member's photo as the Chest serves it (members.lookup), or
// their initials. Decorative when the name is written beside it (the
// default); with `label`, an image with that name for a screen reader
// (a stack of faces with no names beside them).
//
// AvatarStack: a few faces and "+2", every face whole enough to read its
// initials (Rooms' stacks cropped all but the last one), with the names
// said once for screen readers.
import type { ReactElement } from "react";
import { fill, initials, plural } from "./text.js";
import { en, type ShellWords } from "./words.js";

export type AvatarSize = "s" | "m" | "l" | "xl";

export function Avatar({ name, photo, size = "m", label, className }: { name: string; photo?: string | null; size?: AvatarSize; label?: string; className?: string }): ReactElement {
  const cls = `ck-avatar ck-avatar-${size}${className ? " " + className : ""}`;
  if (photo) return <img className={cls} src={photo} alt={label ?? ""} title={label} loading="lazy" decoding="async" />;
  return label
    ? <span className={cls} role="img" aria-label={label} title={label}>{initials(name)}</span>
    : <span className={cls} aria-hidden="true">{initials(name)}</span>;
}

export type Face = { readonly id?: string; readonly name: string; readonly photo?: string | null };

// The people's names in one sentence: "Léa, Hugo and 2 others" is built
// by the tool if it wants it; the stack says "Léa, Hugo, Tom, and 2 others"
// through its label (names joined by ", ").
export function AvatarStack({ people, max = 3, size = "m", label, labels = en.shell, lang = "en" }: { people: readonly Face[]; max?: number; size?: AvatarSize; label?: string; labels?: Pick<ShellWords, "more">; lang?: string }): ReactElement | null {
  if (people.length === 0) return null;
  const shown = people.length > max ? people.slice(0, Math.max(1, max - 1)) : people;
  const rest = people.length - shown.length;
  const names = shown.map(p => p.name).join(", ");
  const said = label ?? (rest > 0 ? `${names} ${plural(labels.more, rest, lang)}` : names);
  return (
    <span className={`ck-stack ck-stack-${size}`} role="img" aria-label={said} title={said}>
      {shown.map((p, i) => <Avatar key={p.id ?? `${i}-${p.name}`} name={p.name} photo={p.photo ?? null} size={size} />)}
      {rest > 0 && <span className={`ck-avatar ck-avatar-${size} ck-avatar-more`} aria-hidden="true">{fill("+{count}", { count: String(rest) })}</span>}
    </span>
  );
}
