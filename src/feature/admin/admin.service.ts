/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { pgPool } from '../../lib/pg/client.js'; // Ensure the correct import path
import OpenAI from 'openai';
import { CONFIG } from '../../utils/constants/config.js';

@Injectable()
export class AdminService {
  /**
   * Inserts a new personal_info record into the database.
   *
   * 1. Generates an embedding for the provided content using OpenAI.
   * 2. Inserts the content, embedding, and category into the personal_info table.
   * 3. Returns the inserted record's id, content, category, and created_at fields.
   *
   * @param content - The text content to embed and store.
   * @param category - The category for the content (e.g., education, project).
   * @returns The inserted record's id, content, category, and created_at.
   * @throws InternalServerErrorException if any error occurs during the process.
   */
  async createPersonalInfo(
    content: string,
    category: string,
  ): Promise<{
    id: number;
    content: string;
    category: string;
    created_at: Date;
  }> {
    try {
      // 1. Get the embedding from OpenAI
      const openai = new OpenAI({ apiKey: CONFIG.OPENAI_API_KEY });
      const response = await openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: content,
        encoding_format: 'float', // optional, but recommended
      });

      // 2. Extract the embedding vector from the response
      const vector = response.data[0].embedding; // array of floats

      // Convert the vector array to a string format compatible with pgvector: '[0.1,0.2,...]'
      const vectorString = `[${vector.join(',')}]`;

      // 3. Insert the data into the database
      const query = `
        INSERT INTO personal_info (content, embedding, category)
        VALUES ($1, $2, $3)
        RETURNING id, content, category, created_at
      `;
      const values = [content, vectorString, category];
      const result = await pgPool.query(query, values);
      // Ensure the return type matches the annotation
      return {
        id: result.rows[0].id,
        content: result.rows[0].content,
        category: result.rows[0].category,
        created_at: result.rows[0].created_at,
      };
    } catch (error: unknown) {
      console.error('Error inserting personal info:', error);
      let errorMessage = '';
      if (error instanceof Error) {
        errorMessage = error.message;
      } else if (typeof error === 'string') {
        errorMessage = error;
      } else {
        errorMessage = 'Unknown error';
      }
      throw new InternalServerErrorException(
        'Error inserting personal info',
        errorMessage,
      );
    }
  }

  /**
   * Finds the most relevant personal_info records by semantic similarity to a query string.
   * @param queryText - The question or text to search for.
   * @param matchCount - Number of results to return (default: 3)
   * @param matchThreshold - Minimum similarity threshold (default: 0.2)
   */
  async findSimilarPersonalInfo(
    queryText: string,
    matchCount = 3,
    matchThreshold = 0.2,
  ) {
    try {
      const openai = new OpenAI({ apiKey: CONFIG.OPENAI_API_KEY });
      const response = await openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: queryText,
        encoding_format: 'float',
      });
      const embedding = response.data[0].embedding;
      const sql = `
        SELECT *
        FROM match_personal_info(
            $1,  -- embedding (vector/array)
            $2,  -- match_threshold
            $3   -- match_count
        );
        `;
      const embeddingStr = `[${embedding.join(',')}]`;
      const result = await pgPool.query(sql, [embeddingStr, 0.9999, 10]);
      return result.rows;
    } catch (error) {
      console.log(error);
      throw new InternalServerErrorException(
        'Error searching personal info',
        (error as Error)?.message,
      );
    }
  }
}
