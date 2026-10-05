import { useState } from "react";

// An island: interactive in the browser, rendered first by the server.
export function Counter({ start }: { start: number }) {
  const [count, setCount] = useState(start);
  return <button type="button" onClick={() => setCount(count + 1)}>Clicked {count} times</button>;
}
