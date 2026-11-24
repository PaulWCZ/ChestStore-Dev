import { connect } from "../../../packages/chest-client/src/realtime-client.js";

// The script of the chat page, served as /chest/chat.js: live through the
// Chest's realtime with the SDK's browser client — no socket in the tool —.
// The lobby says who is here and who is typing; room 1, once joined (a row
// of chat_members), shows its messages as their rows are committed (its
// feed), fetched from the tool once joined and after a gap; the page says
// it shows room 1 (focus), which the tool reads to tell who to notify.
// Writing goes through the tool (/chest/api/chat/…), which checks the
// member. Signed out — the Chest restarted, the session gone —, the page
// keeps what was being written and reloads: the provider signs the member
// in again without a word while it still does. Text is always set as text.
type Message = { id: number; room: number; author: string; text: string };

const root = document.getElementById("chat");
const me = root?.dataset["member"] ?? "";
const live = document.getElementById("live");
const present = document.getElementById("present");
const typing = document.getElementById("typing");
const list = document.getElementById("messages");
const join = document.getElementById("join") as HTMLButtonElement | null;
const leave = document.getElementById("leave") as HTMLButtonElement | null;
const form = document.getElementById("say") as HTMLFormElement | null;

const say = (element: HTMLElement | null, text: string) => { if (element) element.textContent = text; };
const shown = new Set<number>();
let last = 0;

function add(message: Message): void {
  if (shown.has(message.id) || !list) return;
  shown.add(message.id);
  last = Math.max(last, message.id);
  const item = document.createElement("li");
  item.dataset["author"] = message.author === me ? "me" : "other";
  item.textContent = (message.author === me ? "You: " : "Them: ") + message.text;
  list.append(item);
}

async function call(method: string, path: string, body?: unknown): Promise<Response> {
  return fetch(path, { method, credentials: "same-origin", headers: body === undefined ? {} : { "Content-Type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}

// fetchAfter asks the tool for what came after the last message shown.
async function fetchAfter(): Promise<void> {
  const answer = await call("GET", "/chest/api/chat/rooms/1/messages?after=" + String(last));
  if (answer.ok) for (const message of (await answer.json() as { messages: Message[] }).messages) add(message);
}

// What was being written, kept across a reload.
const draftKey = "chat-draft";
const input = form?.querySelector("input");
try {
  const kept = sessionStorage.getItem(draftKey);
  if (input && kept) input.value = kept;
  sessionStorage.removeItem(draftKey);
} catch { /* no storage: nothing kept */ }

const connection = connect();
connection.on("status", connected => say(live, connected ? "Live" : "Reconnecting…"));
connection.on("closed", reason => {
  if (reason === "signed_out") {
    try { if (input?.value) sessionStorage.setItem(draftKey, input.value); } catch { /* lost with the page */ }
    location.reload();
    return;
  }
  // Access removed: nobody is shown here any more, and nothing can be sent.
  say(live, "Access removed");
  say(present, "");
  say(typing, "");
  for (const control of [join, leave, ...(form ? [...form.elements] : [])]) if (control) (control as HTMLButtonElement).disabled = true;
});

const lobby = connection.channel("lobby");
lobby.presence.track({ page: "chat" });
lobby.presence.on(here => say(present, here.length === 1 ? "1 here" : `${here.length} here`));
let quiet: ReturnType<typeof setTimeout> | undefined;
lobby.peers.on("typing", (_, from) => {
  if (from === me) return;
  say(typing, "Someone is typing…");
  clearTimeout(quiet);
  quiet = setTimeout(() => say(typing, ""), 5000);
});

let room: ReturnType<typeof connection.channel> | undefined;
function enter(): void {
  room = connection.channel("room:1");
  room.onJoined(({ replayed }) => {
    if (join) join.hidden = true;
    if (leave) leave.hidden = false;
    if (form) form.hidden = false;
    connection.focus("room:1");
    // Back however long away, what was missed comes again from the
    // Chest (its change log): the tool may stay asleep.
    if (!replayed) void fetchAfter();
  });
  room.onResync(() => void fetchAfter());
  room.on("chat_messages.insert", row => add(row as Message));
  room.onKicked(() => {
    room?.leave();
    room = undefined;
    if (join) join.hidden = false;
    if (leave) leave.hidden = true;
    if (form) form.hidden = true;
    say(typing, "You left the room.");
  });
}
// A member already in the room is let in at once; the others are refused
// until they join, and asked again then.
enter();

join?.addEventListener("click", () => {
  void call("POST", "/chest/api/chat/rooms/1/join").then(answer => {
    if (!answer.ok) return;
    room?.leave();
    enter();
  });
});
leave?.addEventListener("click", () => { void call("POST", "/chest/api/chat/rooms/1/leave"); });

let typed = 0;
form?.querySelector("input")?.addEventListener("input", () => {
  if (Date.now() - typed < 2000) return;
  typed = Date.now();
  lobby.peers.send("typing");
});
form?.addEventListener("submit", event => {
  event.preventDefault();
  if (!input) return;
  void call("POST", "/chest/api/chat/rooms/1/messages", { text: input.value }).then(async answer => {
    if (!answer.ok) return;
    input.value = "";
    add((await answer.json() as { message: Message }).message);
  });
});
