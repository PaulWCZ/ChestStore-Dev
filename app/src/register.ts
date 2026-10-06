import type { KitWords } from "@argentic/chest-ui/components/logic";
import type { ComponentType } from "react";

// What a tool tells the package about itself, once, in src/register.ts:
//
//   declare module "@argentic/chest-app" {
//     interface Register { words: Catalogue; actions: typeof actions; islands: typeof islands }
//   (and, when a page tells its layout something: layout: { trash: boolean })
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
    // publicBody: what a visitor reads instead (optional).
    readonly notFound: { readonly title: string; readonly body: string; readonly publicBody?: string };
    readonly forbidden: { readonly title: string; readonly body: string };
    readonly failed: { readonly title: string; readonly body: string };
    readonly signIn: string;
    readonly busy: string;
    readonly language: string;
    readonly back: string;
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
    // A public action past its bound (optional: "unavailable" otherwise).
    readonly limit?: string;
    // A public form open too long, or sent twice (optional: "unavailable"
    // otherwise): "This form expired: send it again."
    readonly expired?: string;
    // A form whose action asks a proof of work (bound.work), sent by a
    // browser without JavaScript (required then): "This form needs
    // JavaScript: turn it on, or write to us another way."
    readonly needs_javascript?: string;
    // An amount written "1,250": 1250 or 1.25? (optional: "invalid" otherwise).
    readonly amount_ambiguous?: string;
  };
  readonly kit: KitWords;
};

type Registered<K extends string, Fallback> = Register extends { [P in K]: infer T } ? T : Fallback;
export type Words = Registered<"words", CoreWords> & CoreWords;
// The codes of the tool's own catalogue (a code it does not say, as the
// optional "limit", "expired" and "needs_javascript", is not one it may use).
export type ErrorCode = Extract<keyof Registered<"words", CoreWords>["errors"], string>;
export type RegisteredActions = Registered<"actions", Record<string, unknown>>;
export type RegisteredIslands = Registered<"islands", Record<string, ComponentType<any>>>;
// What a page may tell its layout (View.layout → LayoutProps.data): the
// tool's own shape, registered as layout (a plain object type).
export type LayoutData = Registered<"layout", Record<string, never>>;
