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

let registry: Record<string, ComponentType<object>> = {};
export function setIslands(islands: Record<string, ComponentType<never>>): void {
  registry = islands as typeof registry;
}

// Each island is rendered as a React root of its own, as the browser
// hydrates it: the ids React makes (useId: a label's htmlFor, a dialog's
// aria-labelledby) come out the same on both sides. Each root has its own
// prefix — its place in the page and a mark of this render, so an island a
// refresh adds never takes the prefix of one already there.
let count = 0;
let mark = "";
export function startRender(): void {
  count = 0;
  mark = Math.random().toString(36).slice(2, 6);
}

// <Island name="DeleteNote" props={{…}} />: a component of the tool's
// src/islands/index.ts, rendered here and made interactive in the browser
// with the same props. Props are checked against the component's and must
// be plain data. After a refresh, an island keeps its state and receives
// its new props. id: a stable id for an island that must survive a move
// to another page (the layout's ToastHost: id="toasts").
export function Island<N extends Extract<keyof RegisteredIslands, string>>({ name, props, id }: { name: N; props: Plain<ComponentProps<RegisteredIslands[N]>>; id?: string }) {
  const component = registry[name];
  if (!component) throw new Error(`the island ${name} is not listed in src/islands/index.ts`);
  const prefix = `${name.toLowerCase()}${count++}${mark}-`;
  const html = renderToString(createElement(component, props as object), { identifierPrefix: prefix });
  return <div className="island" id={id} data-island={name} data-prefix={prefix} data-props={JSON.stringify(props)} dangerouslySetInnerHTML={{ __html: html }} />;
}
