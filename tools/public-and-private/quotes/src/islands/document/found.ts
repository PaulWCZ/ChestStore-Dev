import { call } from "@argentic/chest-app/client";
import { useEffect, useState } from "react";

// What a picker's search finds, asked of the server as the dialog opens
// and a moment after one stops typing (the page carries no list: studio.6
// bounds an island's props). `rows` is null until the first answer; an
// answer that comes after a newer question is dropped. A failed search
// keeps what was shown (the package says why in a toast).
export function useFound<T>(name: "findClients" | "findItems", q: string, extra: Record<string, string>): { rows: T[] | null } {
  const [rows, setRows] = useState<T[] | null>(null);
  const key = JSON.stringify(extra);
  useEffect(() => {
    let current = true;
    const timer = setTimeout(async () => {
      const result = await call(name, { q: q.trim(), ...(JSON.parse(key) as Record<string, string>) } as never, { refresh: false });
      if (current && result.ok) setRows(result.value as T[]);
    }, rows === null ? 0 : 200);
    return () => { current = false; clearTimeout(timer); };
    // rows is read for the first wait only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, q, key]);
  return { rows };
}
