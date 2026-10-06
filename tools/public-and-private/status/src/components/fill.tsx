import { Fragment, type ReactNode } from "react";

// Fill puts elements (a <time>, a link) into a catalogue's words, where its
// {placeholders} say — the word order stays each language's.
export function Fill({ text, values }: { text: string; values: Record<string, ReactNode> }) {
  return (
    <>
      {text.split(/(\{\w+\})/u).map((part, i) => {
        const key = /^\{(\w+)\}$/u.exec(part)?.[1];
        return <Fragment key={i}>{key !== undefined && key in values ? values[key] : part}</Fragment>;
      })}
    </>
  );
}
