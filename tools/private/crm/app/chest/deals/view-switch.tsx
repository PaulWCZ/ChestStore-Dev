"use client";

import { Segmented } from "@argentic/chest-ui/components";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { ListIcon, Pipeline } from "../../../components/icons.tsx";

// Board or list: the kit's segmented choice (two radios, arrows move
// between them); each view has its own address, which it opens.
export function ViewSwitch({ view, board, list, label, words }: { view: "board" | "list"; board: string; list: string; label: string; words: { board: string; list: string } }) {
  const router = useRouter();
  const [shown, setShown] = useState(view);
  const [, start] = useTransition();
  useEffect(() => setShown(view), [view]);
  return (
    <Segmented label={label} name="view" value={shown}
      options={[{ value: "board", label: words.board, icon: <Pipeline /> }, { value: "list", label: words.list, icon: <ListIcon /> }]}
      onChange={next => { setShown(next); start(() => router.push(next === "board" ? board : list)); }} />
  );
}
