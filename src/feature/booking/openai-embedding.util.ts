import { embeddingsModel } from '../../lib/ai-gateway/models.js';

/**
 * Generates an embedding vector for the given text via the Vercel AI Gateway.
 *
 * @param text - The input text to embed.
 * @returns The embedding vector as an array of floats.
 */
export const getEmbedding = async (text: string): Promise<number[]> => {
  return embeddingsModel.embedQuery(text);
};
