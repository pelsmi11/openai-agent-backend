import z from 'zod';
import { tool } from '@openai/agents';
import { pgPool } from '../../lib/pg/client.js';
import { getEmbedding } from './openai-embedding.util.js';
import { EMBEDDING_SEARCH_DEFAULTS } from '../../utils/constants/dafultvalues.js';

/**
 * Returns an OpenAI Agent tool for semantic search over personal information.
 *
 * The tool accepts a question and optional match_threshold and match_count parameters,
 * generates an embedding for the question, and queries the database for similar entries.
 *
 * @returns {Promise<any>} - The configured OpenAI Agent tool.
 */
export const getSearchPersonalInfoTool = async () => {
  return tool({
    name: 'searchPersonalInfo',
    description: 'Searches personal information by semantic similarity',
    parameters: z.object({
      question: z.string().describe('The user question about Hector'),
      match_threshold: z
        .number()
        .optional()
        .default(EMBEDDING_SEARCH_DEFAULTS.match_threshold), // You can tune this value
      match_count: z
        .number()
        .optional()
        .default(EMBEDDING_SEARCH_DEFAULTS.match_count),
    }),
    execute: async ({
      question,
      match_threshold = EMBEDDING_SEARCH_DEFAULTS.match_threshold,
      match_count = EMBEDDING_SEARCH_DEFAULTS.match_count,
    }) => {
      // Generate embedding for the question
      const embedding = await getEmbedding(question);

      // Query the database for similar personal info
      const sql = `
        SELECT *
        FROM match_personal_info(
            $1,  -- embedding (vector/array)
            $2,  -- match_threshold
            $3   -- match_count
        );
        `;
      const embeddingStr = `[${embedding.join(',')}]`;
      const result = await pgPool.query(sql, [
        embeddingStr,
        match_threshold,
        match_count,
      ]);

      // Limit the response size to avoid exceeding 10KB
      const resultsfined = result.rows.map((row) => ({
        id: row.id,
        content: row.content, // Adjust as needed
        category: row.category,
      }));
      const jsonResponse = JSON.stringify(resultsfined);
      if (jsonResponse.length > 10_000) {
        console.log({
          message:
            'Too much information, please be more specific in your question.',
          length: jsonResponse.length,
        });
        // Return a friendly error if too much data
        return [
          {
            content:
              'Too much information, please be more specific in your question.',
          },
        ];
      }
      return resultsfined;
    },
  });
};
