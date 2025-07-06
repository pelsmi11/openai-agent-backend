import { pgPool } from '../../lib/pg/client.js';
import OpenAI from 'openai';
import { CONFIG } from '../../utils/constants/config.js';
import { getEmbedding } from '../booking/openai-embedding.util.js';

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

export async function findSimilarPersonalInfo(
  queryText,
  matchCount = 3,
  matchThreshold = 0.9999,
) {
  try {
    const embedding = await getEmbedding(queryText);

    // Llama a tu función SQL con los parámetros
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
      matchCount,     // count (integer)
    ]);

    // Recorta el contenido para no exceder 10KB si es necesario
    const resultsfined = result.rows.map((row) => ({
      id: row.id,
      content: row.content, // Ajusta a tu gusto
      category: row.category,
    }));
    const jsonResponse = JSON.stringify(resultsfined);
    if (jsonResponse.length > 10_000) {
      console.log({
        mensaje:
          'Demasiada información, por favor sé más específico en tu pregunta.',
        longitud: jsonResponse.length,
      });
      // Recorta aún más, o lanza un error amigable
      return [
        {
          content:
            'Demasiada información, por favor sé más específico en tu pregunta.',
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
