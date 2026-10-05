import { Island } from "./islands.js";

// The members' page, /chest.
export function ChestPage({ firstName }: { firstName: string }) {
  return (
    <main>
      <h1>{`Hello ${firstName}`}</h1>
      <Island name="Counter" props={{ start: 0 }} />
    </main>
  );
}
