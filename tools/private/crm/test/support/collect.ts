// An export written as it goes (an async iterable of text, or a stream of
// bytes), read whole: what the person's browser saves.
export async function collect(body: AsyncIterable<string> | ReadableStream<Uint8Array>): Promise<string> {
  if (body instanceof ReadableStream) return new TextDecoder().decode(await bytes(body));
  let text = "";
  for await (const chunk of body) text += chunk;
  return text;
}

export async function bytes(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
