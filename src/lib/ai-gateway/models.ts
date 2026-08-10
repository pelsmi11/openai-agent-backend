import { ChatOpenAI, OpenAIEmbeddings } from '@langchain/openai';
import { CONFIG } from '../../utils/constants/config.js';

// Vercel AI Gateway exposes an OpenAI-compatible endpoint, so @langchain/openai's clients
// work against it unmodified — just point baseURL at the gateway and use its model ids
// (e.g. "openai/gpt-4o-mini"). Swapping providers/models later is an env var change only.
const gatewayConfiguration = {
  baseURL: CONFIG.AI_GATEWAY_BASE_URL,
};

// ponytail: default maxRetries is 6 with backoff — on a tight free-tier rate limit that
// silently fires several extra requests per call before giving up. 2 is enough to smooth
// over a transient blip without hammering the limit; raise it once you're on paid credits.
function createChatModel(model: string, maxTokens: number) {
  const reasoningEffort = model.startsWith('openai/gpt-5') ? ('low' as const) : undefined;
  return new ChatOpenAI({
    apiKey: CONFIG.AI_GATEWAY_API_KEY,
    model,
    configuration: gatewayConfiguration,
    maxRetries: 2,
    maxTokens,
    reasoning: reasoningEffort ? { effort: reasoningEffort } : undefined,
    temperature: 0,
  });
}

export const planningChatModel = createChatModel(CONFIG.AI_GATEWAY_PLANNING_MODEL, 1_000);
export const synthesisChatModel = createChatModel(CONFIG.AI_GATEWAY_SYNTHESIS_MODEL, 3_000);
export const meetingChatModel = createChatModel(CONFIG.AI_GATEWAY_MEETING_MODEL, 1_500);

export const embeddingsModel = new OpenAIEmbeddings({
  apiKey: CONFIG.AI_GATEWAY_API_KEY,
  model: CONFIG.AI_GATEWAY_EMBEDDING_MODEL,
  configuration: gatewayConfiguration,
  maxRetries: 2,
});
