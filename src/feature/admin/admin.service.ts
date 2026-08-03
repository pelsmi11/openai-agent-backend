import { pgPool } from '../../lib/pg/client.js';
import { EMBEDDING_SEARCH_DEFAULTS } from '../../utils/constants/dafultvalues.js';
import { getEmbedding } from '../booking/openai-embedding.util.js';
import { searchPersonalInfo } from '../booking/personal-info-search.service.js';

export interface PersonalInfoEntry {
  id: string;
  content: string;
  category: string | null;
  created_at: Date;
}

/**
 * Creates a new personal info entry in the database with an OpenAI embedding.
 *
 * @param content - The content to store.
 * @param category - The category of the content.
 * @returns The created entry with id, content, category, and created_at.
 */
export async function createPersonalInfo(
  content: string,
  category: string,
): Promise<PersonalInfoEntry> {
  try {
    const vector = await getEmbedding(content);
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
      'Error inserting personal info: ' + (error instanceof Error ? error.message : error),
    );
  }
}

export interface SimilarPersonalInfoResult {
  id?: string;
  content: string;
  category?: string | null;
  similarity?: number;
}

/**
 * Finds similar personal info entries using semantic search with OpenAI embeddings and pgvector.
 *
 * @param queryText - The query string to search for.
 * @param matchCount - The maximum number of matches to return.
 * @param matchThreshold - The similarity threshold (0-1).
 * @returns An array of similar personal info entries.
 */
export async function findSimilarPersonalInfo(
  queryText: string,
  matchCount = 3,
  minSimilarity = EMBEDDING_SEARCH_DEFAULTS.min_similarity,
): Promise<SimilarPersonalInfoResult[]> {
  try {
    const result = await searchPersonalInfo(queryText, { minSimilarity, matchCount });

    // Limit the response size to avoid exceeding 10KB
    const resultsfined = result.map((row) => ({
      id: row.id,
      content: row.content,
      category: row.category,
      similarity: row.similarity,
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
      'Error searching personal info: ' + (error instanceof Error ? error.message : error),
    );
  }
}
