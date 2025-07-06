import { pgPool } from '../../lib/pg/client.js';
import OpenAI from 'openai';
import { CONFIG } from '../../utils/constants/config.js';
import { getEmbedding } from '../booking/openai-embedding.util.js';

/**
 * Creates a new personal info entry in the database with an OpenAI embedding.
 *
 * @param {string} content - The content to store.
 * @param {string} category - The category of the content.
 * @returns {Promise<object>} - The created entry with id, content, category, and created_at.
 */
export async function createPersonalInfo(content, category) {
  try {
    const openai = new OpenAI({ apiKey: CONFIG.OPENAI_API_KEY });
    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: content,
      encoding_format: 'float',
    });
    const vector = response.data[0].embedding;
    const vectorString = `[${vector.join(',')}]`;
    const query = `
      INSERT INTO personal_info (content, embedding, category)
      VALUES ($1, $2, $3)
      RETURNING id, content, category, created_at
    `;
    const values = [content, vectorString, category];
    const result = await pgPool.query(query, values);
    return {
      id: result.rows[0].id,
      content: result.rows[0].content,
      category: result.rows[0].category,
      created_at: result.rows[0].created_at,
    };
  } catch (error) {
    console.error('Error inserting personal info:', error);
    throw new Error(
      'Error inserting personal info: ' + (error?.message || error),
    );
  }
}

/**
 * Finds similar personal info entries using semantic search with OpenAI embeddings and pgvector.
 *
 * @param {string} queryText - The query string to search for.
 * @param {number} [matchCount=3] - The maximum number of matches to return.
 * @param {number} [matchThreshold=0.9999] - The similarity threshold (0-1).
 * @returns {Promise<object[]>} - An array of similar personal info entries.
 */
export async function findSimilarPersonalInfo(
  queryText,
  matchCount = 3,
  matchThreshold = 0.9999,
) {
  try {
    const embedding = await getEmbedding(queryText);

    // Query the database for similar entries using the match_personal_info function
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
      matchThreshold, // threshold (float)
      matchCount, // count (integer)
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
  } catch (error) {
    console.error('Error searching personal info:', error);
    throw new Error(
      'Error searching personal info: ' + (error?.message || error),
    );
  }
}
