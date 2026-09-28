import { Avatar } from "./avatar.tsx";

// A person as a line: their photo (or initials) and name; someone who left
// reads "(former member)" and is marked.
export function PersonLine({ person, size = 22 }: { person: { name: string; photo: string | null; gone: boolean }; size?: number }) {
  return (
    <span className="person">
      <Avatar name={person.name} photo={person.photo} size={size} />
      <span>{person.name}</span>
    </span>
  );
}
