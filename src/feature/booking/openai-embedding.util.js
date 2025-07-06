import { CONFIG } from '../../utils/constants/config.js';
import OpenAI from 'openai';

export const getEmbedding = async (text) => {
  const openai = new OpenAI({ apiKey: CONFIG.OPENAI_API_KEY });
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text,
    encoding_format: 'float',
  });
  return response.data[0].embedding;
};
