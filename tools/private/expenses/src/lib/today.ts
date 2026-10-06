import { chest } from "@argentic/chest-sdk/chest";

// Today, as a day, in the Chest's zone: the company's day ("due today", a
// receipt's date that has come), the same day as the database's
// current_date (the Chest makes its zone the sessions' TimeZone). Server
// only: the Chest's settings are in the tool's environment.
export function today(): string {
  return chest.today();
}
