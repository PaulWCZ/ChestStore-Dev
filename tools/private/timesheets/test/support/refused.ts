import { AppError } from "../../lib/app-error.ts";

// refused(code) checks a promise failed with that service code.
export const refused = (code: string) => (error: unknown) => {
  if (error instanceof AppError && error.code === code) return true;
  throw new Error(`expected ${code}, got ${error instanceof AppError ? error.code : String(error)}`);
};
