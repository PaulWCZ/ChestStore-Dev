import type { KitWords } from "@argentic/chest-ui/components/logic";
import type { ComponentType } from "react";

// What a tool tells the package about itself, once, in src/register.ts:
//
//   declare module "@argentic/chest-app" {
//     interface Register { words: Catalogue; actions: typeof actions; islands: typeof islands }
//   }
//
// Every page, action, call() and <Island> is then typed with the tool's own
// words, actions and islands — no generic parameter anywhere else.
export interface Register {}

// The words the package itself says, which every catalogue must hold: the
// tool's name, the error pages, the refusals (the codes of fail()) and the
// UI kit's words. A tool adds its own codes to errors.
export type CoreWords = {
  readonly tool: { readonly name: string };
  readonly pages: {
    readonly notFound: { readonly title: string; readonly body: string };
    readonly forbidden: { readonly title: string; readonly body: string };
    readonly failed: { readonly title: string; readonly body: string };
    readonly signIn: string;
    readonly busy: string;
    readonly language: string;
  };
  readonly errors: {
    readonly invalid: string;
    readonly empty: string;
    readonly too_long: string;
    readonly too_large: string;
    readonly forbidden: string;
    readonly not_found: string;
    readonly unavailable: string;
    readonly unknown: string;
  };
  readonly kit: KitWords;
};

type Registered<K extends string, Fallback> = Register extends { [P in K]: infer T } ? T : Fallback;
export type Words = Registered<"words", CoreWords> & CoreWords;
export type ErrorCode = Extract<keyof Words["errors"], string>;
export type RegisteredActions = Registered<"actions", Record<string, unknown>>;
export type RegisteredIslands = Registered<"islands", Record<string, ComponentType<any>>>;
