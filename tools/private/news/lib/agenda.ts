import * as calendar from "@argentic/chest-sdk/calendar";
import { CapabilityNotGranted, ChestError } from "@argentic/chest-sdk/errors";
import type { Sql } from "./db.ts";
import { plain } from "./markdown.ts";
import { eventOf } from "./posts.ts";
import { learn } from "./state.ts";

// Company events in each person's calendar (Proposal (studio): "calendar":
// true). Whoever answers "I'm coming" finds the event in the calendar feed
// their Chest gives them (Google, Outlook, Apple), in their language; it
// leaves it when they take the answer back, when the event is deleted or
// no longer an event. One entry per event (key event:<id>), put again with
// every change. On a Chest without the calendar, the post keeps its "Add
// to my calendar" file.
export const eventKey = (postId: string) => `event:${postId}`;
const hour = 3_600_000;

export async function syncEvent(sql: Sql, postId: string): Promise<void> {
  const e = await eventOf(sql, postId);
  try {
    if (!e || e.going.length === 0) {
      await calendar.remove(eventKey(postId));
      return;
    }
    const texts = [e.own, ...e.versions];
    const title = Object.fromEntries(texts.map(v => [v.locale, [...v.title].slice(0, 120).join("")]));
    const description = Object.fromEntries(texts.filter(v => plain(v.body).trim()).map(v => [v.locale, [...plain(v.body)].slice(0, 1000).join("")]));
    const when = e.event.start
      ? { start: e.event.start, end: e.event.end ?? new Date(e.event.start.getTime() + hour) }
      : { days: { first: e.event.day, last: e.event.lastDay ?? e.event.day } };
    await calendar.put({
      key: eventKey(postId),
      members: e.going.slice(0, 1000),
      title,
      ...(Object.keys(description).length > 0 ? { description } : {}),
      ...when,
      ...(e.event.place ? { location: e.event.place.slice(0, 200) } : {}),
      path: `/chest/posts/${postId}`,
    });
    await learn(sql, "calendar", "on");
  } catch (error) {
    if (error instanceof CapabilityNotGranted) return void (await learn(sql, "calendar", "off"));
    // An event long past, or too far ahead for the calendar: the post's
    // own file still works.
    if (error instanceof ChestError) return;
    throw error;
  }
}

export const calendarPage = calendar.page;
