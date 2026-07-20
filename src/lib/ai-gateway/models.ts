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
export const chatModel = new ChatOpenAI({
  apiKey: CONFIG.AI_GATEWAY_API_KEY,
  model: CONFIG.AI_GATEWAY_CHAT_MODEL,
  configuration: gatewayConfiguration,
  maxRetries: 2,
});

export const embeddingsModel = new OpenAIEmbeddings({
  apiKey: CONFIG.AI_GATEWAY_API_KEY,
  model: CONFIG.AI_GATEWAY_EMBEDDING_MODEL,
  configuration: gatewayConfiguration,
  maxRetries: 2,
});
