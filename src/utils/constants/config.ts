import dotenv from 'dotenv';
dotenv.config();

export const CONFIG = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: process.env.PORT || 3000,
  DATABASE_URL: process.env.DATABASE_URL || '',
  JWT_SECRET: process.env.JWT_SECRET || '',

  // Vercel AI Gateway (chat + embeddings). Swap providers/models by changing the env vars,
  // no code changes needed.
  AI_GATEWAY_API_KEY: process.env.AI_GATEWAY_API_KEY || '',
  AI_GATEWAY_BASE_URL:
    process.env.AI_GATEWAY_BASE_URL || 'https://ai-gateway.vercel.sh/v1',
  AI_GATEWAY_CHAT_MODEL: process.env.AI_GATEWAY_CHAT_MODEL || 'openai/gpt-4o-mini',
  AI_GATEWAY_EMBEDDING_MODEL:
    process.env.AI_GATEWAY_EMBEDDING_MODEL || 'openai/text-embedding-3-small',

  RESEND_API_KEY: process.env.RESEND_API_KEY || '',
  RESEND_FROM_EMAIL: process.env.RESEND_FROM_EMAIL || '',

  GOOGLE_CALENDAR_ID: process.env.GOOGLE_CALENDAR_ID || '',
  GOOGLE_SERVICE_ACCOUNT_EMAIL: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || '',
  GOOGLE_PRIVATE_KEY: process.env.GOOGLE_PRIVATE_KEY || '',

  // Static Meet room (created manually at meet.google.com, doesn't expire from reuse — only
  // recycled after 365 days of no use at all). A service account can't auto-create a Meet
  // link per event (see google-calendar-scheduler.ts), so this is the reusable stand-in.
  GOOGLE_MEET_URL: process.env.GOOGLE_MEET_URL || '',

  // ZITADEL API application (protects this backend's own routes). Auth method: Private Key
  // JWT — these three come from the downloaded key JSON (clientId, keyId, key) and are used
  // to sign the client_assertion sent to the token introspection endpoint.
  ZITADEL_DOMAIN: process.env.ZITADEL_DOMAIN || '',
  ZITADEL_API_CLIENT_ID: process.env.ZITADEL_API_CLIENT_ID || '',
  ZITADEL_API_KEY_ID: process.env.ZITADEL_API_KEY_ID || '',
  ZITADEL_API_PRIVATE_KEY: process.env.ZITADEL_API_PRIVATE_KEY || '',
};
