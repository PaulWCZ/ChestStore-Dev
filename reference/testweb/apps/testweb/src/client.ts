// The script of the team page, served as /chest/app.js: it lists the notes
// and, for who may write, adds and removes them through /chest/api/notes on
// the same origin; it uploads a photo as the SDK's README says — an upload
// the tool authorises (/chest/api/files/upload-url), the file sent as it is
// to the Chest, then described by the tool and shown by its thumbnail.
// Text is always set as text, never as HTML.
type Listed = { notes: { id: number; text: string; author: string }[]; canWrite: boolean };

const list = document.getElementById("notes");
const status = document.getElementById("status");
const form = document.getElementById("new-note");
const upload = document.getElementById("upload");
const photos = document.getElementById("photos");

function say(text: string): void {
  if (status) status.textContent = text;
}

async function call(method: string, path: string, body?: unknown): Promise<Response> {
  return fetch(path, { method, credentials: "same-origin", headers: body === undefined ? {} : { "Content-Type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}

// refused says why a call did not go through; nothing is retried.
function refused(response: Response): void {
  if (response.status === 401 || response.status === 403) say("Your session has expired, or your access to this tool was removed.");
  else if (response.status === 409) say("The list is full.");
  else if (response.status === 400) say("A note is 1 to 280 characters long.");
  else say("The operation did not go through.");
}

async function show(): Promise<void> {
  const response = await call("GET", "/chest/api/notes");
  if (!response.ok) return refused(response);
  const listed = await response.json() as Listed;
  if (!list) return;
  list.replaceChildren(...listed.notes.map(note => {
    const item = document.createElement("li");
    const text = document.createElement("span");
    text.textContent = note.text;
    item.append(text);
    if (listed.canWrite) {
      const remove = document.createElement("button");
      remove.type = "button";
      remove.textContent = "Remove";
      remove.addEventListener("click", () => {
        void call("DELETE", "/chest/api/notes/" + String(note.id)).then(answer => answer.ok ? show() : refused(answer));
      });
      item.append(" ", remove);
    }
    return item;
  }));
}

form?.addEventListener("submit", event => {
  event.preventDefault();
  const input = form.querySelector("input");
  if (!input) return;
  void call("POST", "/chest/api/notes", { text: input.value }).then(async answer => {
    if (!answer.ok) return refused(answer);
    input.value = "";
    say("");
    await show();
  });
});

upload?.addEventListener("submit", event => {
  event.preventDefault();
  const input = upload.querySelector("input");
  const file = input?.files?.[0];
  if (!file) return;
  void (async () => {
    const authorised = await call("POST", "/chest/api/files/upload-url", { name: "photos/" });
    if (!authorised.ok) return refused(authorised);
    const { url } = await authorised.json() as { url: string };
    const sent = await fetch(url, { method: "PUT", credentials: "same-origin", headers: { "Content-Type": file.type }, body: file });
    if (!sent.ok) return say("Upload refused: " + ((await sent.json().catch(() => ({}))) as { error?: string }).error);
    const { name } = await sent.json() as { name: string };
    const described = await call("POST", "/chest/api/files/stat", { name });
    if (!described.ok) return refused(described);
    const { width, height } = await described.json() as { width?: number; height?: number };
    const linked = await call("POST", "/chest/api/files/url", { name, thumbnail: 256 });
    if (!linked.ok) return refused(linked);
    const image = document.createElement("img");
    image.src = (await linked.json() as { url: string }).url;
    image.alt = name;
    const item = document.createElement("li");
    item.append(image);
    photos?.append(item);
    say(`Uploaded: ${name} (${width ?? 0}×${height ?? 0})`);
    if (input) input.value = "";
  })();
});

// A list that cannot be read — the network gone, the page left while it
// loaded — says so; nothing is retried.
void show().catch(() => say("The operation did not go through."));
