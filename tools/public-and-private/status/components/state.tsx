import { StateIcon } from "./icons.tsx";

// A state as people read it: its icon and its word, in its colour. Never
// the colour alone.
export function StateLabel({ state, word, quiet = false }: { state: string; word: string; quiet?: boolean }) {
  return (
    <span className={`state-label s-${state}${quiet ? " quiet" : ""}`}>
      <StateIcon state={state} />
      <span>{word}</span>
    </span>
  );
}
