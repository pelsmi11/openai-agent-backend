import { randomUUID } from 'node:crypto';
import { runAgent } from './agent-graph.js';

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
): Promise<{ reply: string; conversationId: string }> {
  const threadId = conversationId || randomUUID();
  const reply = await runAgent(message, threadId);
  return { reply, conversationId: threadId };
}
