import type { ComponentProps, ComponentType } from "react";
import { islands } from "../islands/index.ts";

// What may cross from the server to the browser: plain data, as JSON
// carries it. A function, a Date, a Map is a type error here.
export type Plain<T> = T extends string | number | boolean | null | undefined ? T
  : T extends (...args: never[]) => unknown ? never
  : T extends Date | Map<unknown, unknown> | Set<unknown> | bigint ? never
  : T extends readonly (infer U)[] ? readonly Plain<U>[]
  : { [K in keyof T]: Plain<T[K]> };

export type IslandName = keyof typeof islands;

// <Island name="DeleteNote" props={{…}} />: a component of
// src/islands/index.ts, rendered here on the server and made interactive in
// the browser (src/core/entry.tsx) with the same props. Its props are
// checked against the component's and must be plain data. After a
// refresh, an island keeps its state and receives its new props.
export function Island<N extends IslandName>({ name, props }: { name: N; props: Plain<ComponentProps<(typeof islands)[N]>> }) {
  const Component = islands[name] as ComponentType<object>;
  return (
    <div className="island" data-island={name} data-props={JSON.stringify(props)}>
      <Component {...(props as object)} />
    </div>
  );
}
