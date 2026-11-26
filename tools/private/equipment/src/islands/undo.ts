// An Undo that tells the truth (the kit's toast): true when it worked,
// else why not, in the reader's words. The step is a call() made quiet —
// the toast says the refusal itself.
export const undoing = (step: () => Promise<{ ok: true } | { ok: false; message: string }>) => async (): Promise<true | string> => {
  const u = await step();
  return u.ok || u.message;
};
