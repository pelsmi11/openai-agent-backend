import z from 'zod';
import { tool } from '@openai/agents';
import { pgPool } from '../../lib/pg/client.js';
import { getEmbedding } from './openai-embedding.util.js';

export const getSearchPersonalInfoTool = async () => {
  return tool({
    name: 'searchPersonalInfo',
    description: 'Searches personal information by semantic similarity',
    parameters: z.object({
      question: z.string().describe('The user question about Hector'),
      match_threshold: z.number().optional().default(0.9999), // Puedes tunear el valor
      match_count: z.number().optional().default(3),
    }),
    execute: async ({
      question,
      match_threshold = 0.9999,
      match_count = 3,
    }) => {
      const embedding = await getEmbedding(question);

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
        match_threshold,
        match_count,
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
    },
  });
};
