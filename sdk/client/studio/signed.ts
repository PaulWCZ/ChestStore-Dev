import type { Channel } from "../src/signed.js";

// Studio proposals (not in 0.4.1): the channels on which the Chest would
// post the studio's deliveries to a tool. Each is 0.4.1's one mechanism
// (src/signed.ts: a compact JWS, HS256, under HMAC-SHA256 of the channel's
// label keyed by the text of CHEST_TOKEN, naming the tool, the delivery and
// the SHA-256 of the body) with a header, a label and identifiers of its
// own — so a delivery of one channel is never read as another's, and the
// modules below verify with 0.4.1's delivery() instead of a copy of it. Not
// a published module.

// Received mail and bounces (mail): POST /chest-mail.
export const mailChannel: Channel = { header: "Chest-Mail", label: "Chest-Mail v1", id: /^(rcv|bnc)_[a-z2-7]{26}$/u, maxBody: 4 << 20 };
// The results of the checks the Chest runs (checks): POST /chest-checks.
export const checkChannel: Channel = { header: "Chest-Check", label: "Chest-Check v1", id: /^chk_[a-z2-7]{26}$/u, maxBody: 4096 };
// The Chest's notices about the tool's webhook targets (webhooks): POST
// /chest-webhooks.
export const webhooksChannel: Channel = { header: "Chest-Webhooks", label: "Chest-Webhooks v1", id: /^whe_[a-z2-7]{26}$/u, maxBody: 4096 };
