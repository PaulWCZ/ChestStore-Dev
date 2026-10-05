import * as ai from "../../../packages/chest-client/src/ai.js";
import { AiCapReached, AiUnavailable } from "../../../packages/chest-client/src/errors.js";

// The tool's AI — the capability ai of its manifest —, through its Chest's
// gateway (the SDK's ai.ts): it summarises a text for a member, whole or
// streamed. When the Chest pauses AI — the month's cap reached, no connector
// behind the alias, the provider down —, the tool keeps working and says
// so: the pattern every tool follows.
export type Summary = { text: string; model: string; cost: number } | { paused: string };

export interface Assistant {
  summarise(text: string, memberId: string, stream: boolean): Promise<Summary>;
}

export class ChestAssistant implements Assistant {
  async summarise(text: string, memberId: string, stream: boolean): Promise<Summary> {
    const request = { model: "default" as const, messages: [{ role: "system" as const, content: "Summarise the member's text in one sentence." }, { role: "user" as const, content: text }], maxTokens: 200, member: memberId };
    try {
      if (!stream) {
        const answer = await ai.chat(request);
        return { text: answer.text, model: answer.model, cost: answer.usage.cost };
      }
      let summary = "", cost = 0;
      for await (const chunk of ai.chat({ ...request, stream: true })) {
        summary += chunk.text;
        if (chunk.usage) cost = chunk.usage.cost;
      }
      return { text: summary, model: "default", cost };
    } catch (error) {
      if (error instanceof AiCapReached || error instanceof AiUnavailable) return { paused: error.code };
      throw error;
    }
  }
}
