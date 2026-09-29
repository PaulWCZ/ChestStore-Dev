"use client";

import { PeoplePicker } from "@argentic/chest-ui/components";
import { localSearch, type PeoplePickerWords } from "@argentic/chest-ui/components/logic";
import { useRouter } from "next/navigation";
import { useMemo } from "react";

type Person = { id: string; name: string; photo: string | null };

// An admin books a desk for someone else: the page then shows the plan as
// that person would book it (their desk, their bookings), and they are
// told. Nobody chosen: for the admin themself. The kit's picker: type a
// name ("lé", "mor"), arrows, Enter.
export function BookFor({ people, current, path, locale, t }: { people: Person[]; current: string; path: string; locale: string; t: { label: string; hint: string; picker: PeoplePickerWords } }) {
  const router = useRouter();
  const search = useMemo(() => localSearch(people), [people]);
  const chosen = people.filter(p => p.id === current);
  return (
    <div className="book-for">
      <PeoplePicker label={t.label} hint={t.hint} clearable value={chosen} search={search} labels={t.picker} lang={locale}
        onChange={v => {
          const url = new URL(path, window.location.origin);
          if (v[0]) url.searchParams.set("for", v[0].id);
          else url.searchParams.delete("for");
          router.push(url.pathname + url.search);
        }} />
    </div>
  );
}
