import { createElement, type ComponentProps, type ComponentType } from "react";
import { renderToString } from "react-dom/server";
import { islands } from "../islands/index.ts";

// What may cross from the server to the browser: plain data, as JSON
// carries it. A function, a Date, a Map is a type error here.
export type Plain<T> = T extends string | number | boolean | null | undefined ? T
  : T extends (...args: never[]) => unknown ? never
  : T extends Date | Map<unknown, unknown> | Set<unknown> | bigint ? never
  : T extends readonly (infer U)[] ? readonly Plain<U>[]
  : { [K in keyof T]: Plain<T[K]> };

export type IslandName = keyof typeof islands;

// Each island is rendered as a React root of its own, as the browser
// hydrates it (src/core/client.tsx): the ids React makes (useId: a label's
// htmlFor, a dialog's aria-labelledby, a menu's aria-controls) then come
// out the same on both sides. Rendered inside the page's tree, they would
// not — the browser's root starts at the island, the server's at <html> —
// and an id the browser writes later (a menu opened) would point at
// nothing. Each root has its own prefix, so two islands never share an id:
// the island's place in the page and a mark of this render (an island
// that a refresh adds never takes the prefix of one already there).
let count = 0;
let render = "";
export function startRender(): void {
  count = 0;
  render = Math.random().toString(36).slice(2, 6);
}

// <Island name="DeleteNote" props={{…}} />: a component of
// src/islands/index.ts, rendered here on the server and made interactive in
// the browser (src/core/entry.tsx) with the same props. Its props are
// checked against the component's and must be plain data. After a
// refresh, an island keeps its state and receives its new props.
export function Island<N extends IslandName>({ name, props }: { name: N; props: Plain<ComponentProps<(typeof islands)[N]>> }) {
  const Component = islands[name] as ComponentType<object>;
  const prefix = `${name.toLowerCase()}${count++}${render}-`;
  const html = renderToString(createElement(Component, props as object), { identifierPrefix: prefix });
  return <div className="island" data-island={name} data-prefix={prefix} data-props={JSON.stringify(props)} dangerouslySetInnerHTML={{ __html: html }} />;
}
