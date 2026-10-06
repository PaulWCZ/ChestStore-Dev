import { ChestError } from "@argentic/chest-sdk/errors";
import * as files from "@argentic/chest-sdk/files";

// Removes files the tool no longer uses from the Chest. A file the Chest
// cannot remove now stays, unused, until it is removed with the tool: its
// row is gone, nobody reaches it.
export async function removeObjects(objects: Iterable<string>): Promise<void> {
  for (const object of objects) {
    try {
      await files.delete(object);
    } catch (error) {
      if (!(error instanceof ChestError)) throw error;
    }
  }
}
