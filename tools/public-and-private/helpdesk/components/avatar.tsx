import { initials } from "../lib/initials.ts";

// A member's photo as the Chest serves it on the team host, or their
// initials. Decorative unless given a title: the name is written beside it.
export function Avatar({ name, photo, size = 28, title }: { name: string; photo: string | null; size?: number; title?: string | undefined }) {
  const style = { width: size, height: size };
  return photo
    ? <img className="avatar" src={photo} alt={title ?? ""} title={title} style={style} />
    : <span className="avatar" aria-hidden={title ? undefined : true} role={title ? "img" : undefined} aria-label={title} title={title} style={style}>{initials(name)}</span>;
}
