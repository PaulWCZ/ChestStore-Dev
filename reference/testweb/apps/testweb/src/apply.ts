// The script of the public page /apply, served as /apply.js: a visitor sends
// a PDF as the SDK's README says — an upload the tool authorises to its
// visitors (/api/apply/upload-url), the file sent as it is to the Chest on
// this page's own address, then given back to the tool (/api/apply), which
// checks it. Text is always set as text, never as HTML.
const form = document.getElementById("apply");
const status = document.getElementById("status");

function say(text: string): void {
  if (status) status.textContent = text;
}

async function post(path: string, body: unknown): Promise<Response> {
  return fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}

form?.addEventListener("submit", event => {
  event.preventDefault();
  const file = form.querySelector("input")?.files?.[0];
  if (!file) return;
  void (async () => {
    const authorised = await post("/api/apply/upload-url", {});
    if (!authorised.ok) return say("Sending is closed for now.");
    const { url } = await authorised.json() as { url: string };
    const sent = await fetch(url, { method: "PUT", body: file });
    const answer = await sent.json() as { name?: string; error?: string };
    if (sent.status !== 201 || !answer.name) return say(`Refused: ${sent.status} ${answer.error ?? ""}`.trim());
    const received = await post("/api/apply", { name: answer.name });
    say(received.ok ? `Received ${answer.name}` : "The file did not reach the tool.");
  })();
});
