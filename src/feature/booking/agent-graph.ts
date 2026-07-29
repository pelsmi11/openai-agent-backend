import { StateGraph, MessagesAnnotation, END, START } from '@langchain/langgraph';
import { ToolNode, toolsCondition } from '@langchain/langgraph/prebuilt';
import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres';
import { SystemMessage, HumanMessage, isAIMessage } from '@langchain/core/messages';
import { chatModel } from '../../lib/ai-gateway/models.js';
import { searchPersonalInfoTool, scheduleMeetingTool } from './agent-tools.js';
import { CONFIG } from '../../utils/constants/config.js';

const tools = [searchPersonalInfoTool, scheduleMeetingTool];
const modelWithTools = chatModel.bindTools(tools);

// Written in English on purpose (not Spanish, even though most users/data are Spanish-speaking):
// the model paraphrases this text directly for generic questions ("who are you?") with no tool
// involved, and Spanish content anywhere in the system prompt — including its own persona
// description — pulled the final answer toward Spanish regardless of the user's language.
// LANGUAGE_RULE is what actually decides the reply's language, not the language this is written in.
const BASE_SYSTEM_PROMPT =
  'You are "Hector", an agent that helps recruiters and potential employers get to know Héctor as a candidate: his work experience, professional profile, skills, way of working, and anything else relevant to a hiring decision, using the searchPersonalInfo tool to look that information up. If asked something that has nothing to do with getting to know Héctor as a candidate (e.g. math problems, the weather, unrelated general topics), say so politely and redirect the conversation to what you can help with: telling them about Héctor.';

// Kept separate (not folded into BASE_SYSTEM_PROMPT) so it stands out as its own directive.
const LANGUAGE_RULE =
  "CRITICAL LANGUAGE RULE: Always write your entire reply in the same language as the user's most recent message, regardless of what language this system prompt or the searchPersonalInfo results are in. English message in -> English reply out. Spanish in -> Spanish out. German in -> German out. Translate any retrieved info into that language before answering.";

const MEETING_OFFER_NUDGE =
  "The conversation has gone on for a few messages now: if you haven't already, ask the person if they'd be interested in contacting Héctor about a job opportunity and scheduling a meeting. If they agree, ask for their email and preferred time, confirm both, and use the scheduleMeeting tool.";

const MEETING_OFFER_THRESHOLD = 5;

// Computed per request (not cached at module load) so it's accurate no matter how long the
// server has been running — the model has no other way to know "today", and without this it
// hallucinates arbitrary (sometimes past) dates for relative references like "next Thursday".
function todayContext(): string {
  const now = new Date();
  const weekday = now.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' });
  return `Today is ${weekday}, ${now.toISOString()} (UTC). Use this date as the reference for calculating any relative date the user mentions (in whatever language/phrasing they use) — always in the future relative to this date.`;
}

async function agentNode(state: typeof MessagesAnnotation.State) {
  // Derived from the message history instead of a separate counter field, so there's a
  // single source of truth for how many turns the conversation has had.
  const humanMessageCount = state.messages.filter(HumanMessage.isInstance).length;
  const systemPrompt = [
    LANGUAGE_RULE,
    BASE_SYSTEM_PROMPT,
    todayContext(),
    humanMessageCount >= MEETING_OFFER_THRESHOLD ? MEETING_OFFER_NUDGE : null,
    // Repeated at the end (not just the top) because searchPersonalInfo's results are in
    // Spanish — once that lands in context, its language tends to dominate the final answer
    // over an instruction stated only once, earlier, in a different language.
    LANGUAGE_RULE,
  ]
    .filter(Boolean)
    .join('\n\n');

  const response = await modelWithTools.invoke([
    new SystemMessage(systemPrompt),
    ...state.messages,
  ]);
  return { messages: [response] };
}

const checkpointer = PostgresSaver.fromConnString(CONFIG.DATABASE_URL);

let setupDone: Promise<void> | undefined;

/** Creates LangGraph's checkpoint tables if they don't exist yet. Call once at startup. */
export function setupAgentGraph(): Promise<void> {
  if (!setupDone) {
    setupDone = checkpointer.setup();
  }
  return setupDone;
}

const graph = new StateGraph(MessagesAnnotation)
  .addNode('agent', agentNode)
  .addNode('tools', new ToolNode(tools))
  .addEdge(START, 'agent')
  .addConditionalEdges('agent', toolsCondition, { tools: 'tools', [END]: END })
  .addEdge('tools', 'agent')
  .compile({ checkpointer });

/**
 * Runs the Hector agent for a single user message, resuming the conversation identified by
 * threadId (persisted via PostgresSaver, so it survives restarts).
 */
export async function runAgent(message: string, threadId: string): Promise<string> {
  const result = await graph.invoke(
    { messages: [new HumanMessage(message)] },
    { configurable: { thread_id: threadId } },
  );
  const lastMessage = result.messages[result.messages.length - 1];
  return typeof lastMessage.content === 'string'
    ? lastMessage.content
    : JSON.stringify(lastMessage.content);
}

/**
 * Same as runAgent, but yields the reply token by token as the model generates it (streamMode
 * "messages" gives one message chunk per token/delta, from any node — including the raw
 * ToolMessage output of searchPersonalInfo/scheduleMeeting, which isAIMessage filters out so
 * only the model's own text reaches the caller). While a tool is being called there's no text
 * to yield yet — chunks resume once the agent node runs again with the tool's result.
 */
export async function* streamAgent(message: string, threadId: string): AsyncGenerator<string> {
  const stream = await graph.stream(
    { messages: [new HumanMessage(message)] },
    { configurable: { thread_id: threadId }, streamMode: 'messages' },
  );
  for await (const [chunk] of stream) {
    if (isAIMessage(chunk) && typeof chunk.content === 'string' && chunk.content.length > 0) {
      yield chunk.content;
    }
  }
}
