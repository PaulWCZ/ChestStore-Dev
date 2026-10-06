// Safe in the browser: no SDK, no server code here (the rules that read
// what a person sends are src/lib/input.ts).
// The rules of what a person writes, and the shapes pages receive. No
// framework, no database: tested alone.

export const limits = {
  title: 140,
  body: 20000,
  comment: 2000,
  place: 200,
  fileName: 200,
  attachmentsPerPost: 10,
  attachmentSize: 25 << 20,
  coverSize: 15 << 20,
  commentsPerPost: 1000,
  page: 20,
  // The groups and the people a post may be kept to.
  groupsPerPost: 16,
  peoplePerPost: 500,
  // Pictures of a post's gallery, and inside its text.
  imagesPerPost: 20,
  inlinePerPost: 20,
  // Seats of an event.
  seats: 10000,
  // Days an event may last.
  eventDays: 31,
  // A search: its length, its words, its results.
  query: 200,
  queryWords: 8,
  results: 30,
  // How far ahead a post may be scheduled, in days.
  scheduleDays: 366,
  // An Important post asks for confirmation this many days (then it stops
  // counting on the tile).
  confirmDays: 90,
} as const;

// The five kinds of post, in the order the composer offers them. A
// welcome and a shout-out name a colleague (posts.welcome).
export const kinds = ["announcement", "event", "welcome", "shoutout", "info"] as const;
export type Kind = (typeof kinds)[number];
export const isKind = (value: unknown): value is Kind => typeof value === "string" && (kinds as readonly string[]).includes(value);

// The reactions: a small fixed set, stored by name.
export const emojis = { thumbs: "👍", heart: "❤️", party: "🎉", clap: "👏", smile: "😄" } as const;
export type Emoji = keyof typeof emojis;
export const emojiNames = Object.keys(emojis) as Emoji[];
export const isEmoji = (value: unknown): value is Emoji => typeof value === "string" && Object.hasOwn(emojis, value);

// Picture types the Chest makes thumbnails of: the only covers accepted.
export const coverTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"] as const;
export const isCoverType = (type: string): boolean => (coverTypes as readonly string[]).includes(type);

// What ids look like: a row's (bigint), a member's, a group's
// (src/lib/input.ts reads them).
export const idPattern = /^[1-9][0-9]{0,17}$/u;
export const memberPattern = /^mbr_[a-z2-7]{26}$/u;
export const groupPattern = /^grp_[a-z2-7]{26}$/u;

// Audience. A post is for everyone (no groups, no people), or for the
// members of some of the Chest's groups and some people picked by hand:
// either lets a person in. Pure: the composer counts with it too.
export type Audience = { groups: readonly string[]; people: readonly string[] };
export type Grouped = { id: string; groups: readonly string[] };

export function inAudience(person: Grouped, post: Audience): boolean {
  if (post.groups.length === 0 && post.people.length === 0) return true;
  return post.people.includes(person.id) || post.groups.some(g => person.groups.includes(g));
}

export const isEveryone = (post: Audience): boolean => post.groups.length === 0 && post.people.length === 0;

// Languages of a post: its own words (in the language it was written in)
// and versions in other languages. Each reader sees their language's
// version, or the post's own.
export type Version = { locale: string; title: string; body: string };
export function pick(post: { locale: string; title: string; body: string; versions: readonly Version[] }, locale: string): Version {
  if (post.locale === locale) return { locale, title: post.title, body: post.body };
  return post.versions.find(v => v.locale === locale) ?? { locale: post.locale, title: post.title, body: post.body };
}

// The pictures a text shows (![words](image:<id>)): their file ids, once.
const imageRef = /!\[[^\]\n]{0,200}\]\(image:([1-9][0-9]{0,17})\)/gu;
export function imageRefs(...texts: string[]): string[] {
  return [...new Set(texts.flatMap(t => [...t.matchAll(imageRef)].map(m => m[1]!)))];
}

// Picture and video types a gallery shows (videos are played as they are:
// no thumbnail, no transcoding).
export const videoTypes = ["video/mp4", "video/webm"] as const;
export const isVideoType = (type: string): boolean => (videoTypes as readonly string[]).includes(type);

// Mentions: a comment names a person as @[mbr_…]; people read their name.
export const mentionToken = /@\[(mbr_[a-z2-7]{26}|erased)\]/gu;
export function withNames(text: string, name: (id: string) => string): string {
  return text.replace(mentionToken, (_whole, who: string) => "@" + name(who));
}

// A comment's text in pieces: words, and the people it mentions (by name).
export type Piece = { t: "text"; v: string } | { t: "mention"; name: string };
export function pieces(text: string, name: (id: string) => string): Piece[] {
  const out: Piece[] = [];
  let at = 0;
  for (const m of text.matchAll(mentionToken)) {
    if (m.index > at) out.push({ t: "text", v: text.slice(at, m.index) });
    out.push({ t: "mention", name: name(m[1]!) });
    at = m.index + m[0].length;
  }
  if (at < text.length) out.push({ t: "text", v: text.slice(at) });
  return out;
}
