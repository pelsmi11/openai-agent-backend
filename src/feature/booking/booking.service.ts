import { randomUUID } from 'node:crypto';
import { runAgent, type AgentRunResult } from './agent-graph.js';
import type { AnswerPart, PublicSource } from './agent-response.js';

export interface AskToHectorResponse {
  reply: string;
  conversationId: string;
  answerParts: AnswerPart[];
  sources: PublicSource[];
}

/**
 * Calls the Hector agent (LangGraph) with the user's message. Conversation history and the
 * message counter are persisted in Postgres, keyed by conversationId, so the agent can ask
 * follow-up questions and offer to schedule a meeting across multiple requests.
 *
 * @param message - The user's message for Hector.
 * @param conversationId - Id of an existing conversation to continue; a new one is created if omitted.
 * @returns The agent's reply and the conversation id to reuse.
 */
export async function askToHector(
  message: string,
  conversationId?: string,
): Promise<AskToHectorResponse> {
  const threadId = conversationId || randomUUID();
  const result = await runAgent(message, threadId);
  return { ...result, conversationId: threadId };
}

/**
 * Streaming variant of askToHector: same agent/history, but returns the conversation id
 * immediately and the reply as an async generator of text chunks the caller can forward as
 * they arrive (see booking.controller.ts's SSE handler).
 */
export function askToHectorStream(
  message: string,
  conversationId?: string,
): {
  conversationId: string;
  tokens: AsyncGenerator<string>;
  result: Promise<AgentRunResult>;
} {
  const threadId = conversationId || randomUUID();
  const result = runAgent(message, threadId);

  async function* tokens(): AsyncGenerator<string> {
    const completed = await result;
    for (const chunk of completed.reply.match(/\S+\s*/g) ?? [completed.reply]) yield chunk;
  }

  return { conversationId: threadId, tokens: tokens(), result };
}
