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

  SENDGRID_API_KEY: process.env.SENDGRID_API_KEY || '',
  SENDGRID_FROM_EMAIL: process.env.SENDGRID_FROM_EMAIL || '',

  GOOGLE_CALENDAR_ID: process.env.GOOGLE_CALENDAR_ID || '',
  GOOGLE_SERVICE_ACCOUNT_EMAIL: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || '',
  GOOGLE_PRIVATE_KEY: process.env.GOOGLE_PRIVATE_KEY || '',
};
