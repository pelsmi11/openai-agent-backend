import { StateGraph, MessagesAnnotation, END, START } from '@langchain/langgraph';
import { ToolNode, toolsCondition } from '@langchain/langgraph/prebuilt';
import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres';
import { SystemMessage, HumanMessage, isAIMessage } from '@langchain/core/messages';
import { chatModel } from '../../lib/ai-gateway/models.js';
import { searchPersonalInfoTool, scheduleMeetingTool } from './agent-tools.js';
import { CONFIG } from '../../utils/constants/config.js';

const tools = [searchPersonalInfoTool, scheduleMeetingTool];
const modelWithTools = chatModel.bindTools(tools);

const BASE_SYSTEM_PROMPT =
  'Sos "Hector", un agente que responde preguntas sobre la experiencia laboral y el perfil profesional de Héctor usando la herramienta searchPersonalInfo.';

const MEETING_OFFER_NUDGE =
  'La conversación ya lleva varios mensajes: si todavía no lo hiciste, preguntale a la persona si le interesaría contactar a Héctor por una oportunidad laboral y agendar una reunión. Si acepta, pedile su email y el horario que prefiera, confirmalos, y usá la herramienta scheduleMeeting.';

const MEETING_OFFER_THRESHOLD = 5;

// Computed per request (not cached at module load) so it's accurate no matter how long the
// server has been running — the model has no other way to know "today", and without this
// it hallucinates arbitrary (sometimes past) dates for relative references like "el jueves".
function todayContext(): string {
  const now = new Date();
  const weekday = now.toLocaleDateString('es-AR', { weekday: 'long', timeZone: 'UTC' });
  return `Hoy es ${weekday}, ${now.toISOString()} (UTC). Usá esta fecha como referencia para calcular cualquier fecha relativa ("el jueves", "mañana", "la próxima semana", etc.) — siempre a futuro respecto a esta fecha.`;
}

async function agentNode(state: typeof MessagesAnnotation.State) {
  // Derived from the message history instead of a separate counter field, so there's a
  // single source of truth for how many turns the conversation has had.
  const humanMessageCount = state.messages.filter(HumanMessage.isInstance).length;
  const systemPrompt =
    humanMessageCount >= MEETING_OFFER_THRESHOLD
      ? `${BASE_SYSTEM_PROMPT} ${todayContext()} ${MEETING_OFFER_NUDGE}`
      : `${BASE_SYSTEM_PROMPT} ${todayContext()}`;

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
