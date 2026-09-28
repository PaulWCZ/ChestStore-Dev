import { initials } from "../lib/initials.ts";

// A member's photo as the Chest serves it on the team host, or their
// initials. Decorative: the name is always written beside it.
export function Avatar({ name, photo, size = 32 }: { name: string; photo: string | null; size?: number }) {
  const style = { width: size, height: size, fontSize: Math.max(11, Math.round(size * 0.36)) };
  return photo ? <img className="avatar" src={photo} alt="" style={style} /> : <span className="avatar" aria-hidden="true" style={style}>{initials(name)}</span>;
}
