// The cookie that keeps a guest's secret in their own browser, so they can
// come back to the poll's link and change their answer (lib/guests.ts): one
// per poll, sent only to that poll's public page, never readable by a
// script. The database keeps only its hash.
export const guestCookie = (pollId: string) => `guest_${pollId}`;
export const guestCookiePath = (link: string) => `/p/${link}`;
export const guestCookieDays = 180;
