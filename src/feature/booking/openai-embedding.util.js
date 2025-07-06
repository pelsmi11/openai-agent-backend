import { CONFIG } from '../../utils/constants/config.js';
import OpenAI from 'openai';

/**
 * Generates an embedding vector for the given text using OpenAI's API.
 *
 * @param {string} text - The input text to embed.
 * @returns {Promise<number[]>} - The embedding vector as an array of floats.
 */
export const getEmbedding = async (text) => {
  // Initialize the OpenAI client with the API key from environment variables
  const openai = new OpenAI({ apiKey: CONFIG.OPENAI_API_KEY });
  // Request the embedding from OpenAI's API
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text,
    encoding_format: 'float',
  });
  // Return the embedding vector
  return response.data[0].embedding;
};
