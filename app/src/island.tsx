import { createElement, type ComponentProps, type ComponentType } from "react";
import { renderToString } from "react-dom/server";
import type { RegisteredIslands } from "./register.ts";

// What may cross from the server to the browser: plain data, as JSON
// carries it. A function, a Date, a Map is a type error.
export type Plain<T> = T extends string | number | boolean | null | undefined ? T
  : T extends (...args: never[]) => unknown ? never
  : T extends Date | Map<unknown, unknown> | Set<unknown> | bigint ? never
  : T extends readonly (infer U)[] ? readonly Plain<U>[]
  : { [K in keyof T]: Plain<T[K]> };

// The islands of the page being rendered (renderToString is synchronous:
// one page at a time).
let registry: Record<string, ComponentType<object>> = {};

// Each island is rendered as a React root of its own, as the browser
// hydrates it: the ids React makes (useId: a label's htmlFor, a dialog's
// aria-labelledby) come out the same on both sides. Each root has its own
// prefix — its place in the page and a mark of this render, so an island a
// refresh adds never takes the prefix of one already there.
let count = 0;
let mark = "";
export function startRender(islands: Record<string, ComponentType<never>>): string {
  registry = islands as typeof registry;
  count = 0;
  mark = Math.random().toString(36).slice(2, 6).padEnd(4, "0");
  return mark;
}

// <Island name="DeleteNote" props={{…}} />: a component of the tool's
// src/islands/index.ts, rendered here and made interactive in the browser
// with the same props. Props are checked against the component's and must
// be plain data. After a refresh, an island keeps its state and receives
// its new props. id: a stable id for an island that must survive a move
// to another page (the layout's ToastHost: id="toasts"). Its wrapper's
// DOM id is "island-<id>" (never the id of something its content uses).
export function Island<N extends Extract<keyof RegisteredIslands, string>>({ name, props, id }: { name: N; props: Plain<ComponentProps<RegisteredIslands[N]>>; id?: string }) {
  const component = registry[name];
  if (!component) throw new Error(`the island ${name} is not listed in src/islands/index.ts`);
  const prefix = `${name.toLowerCase()}${count++}${mark}-`;
  const html = renderToString(createElement(component, props as object), { identifierPrefix: prefix });
  const sent = JSON.stringify(props);
  // Props travel twice (rendered, and as data-props): a whole table there
  // fills the tool's 256 MiB. Said in development, where it can be fixed.
  if (process.env.NODE_ENV === "development" && sent.length > 256 * 1024) console.warn(`chest-app: the island ${name} receives ${Math.round(sent.length / 1024)} KB of props — send a first page and counts, and fetch the rest with a parallel action (AGENTS.md, "A big list in an island")`);
  return <div className="island" id={id !== undefined ? `island-${id}` : undefined} data-island={name} data-prefix={prefix} data-props={sent} dangerouslySetInnerHTML={{ __html: html }} />;
}
