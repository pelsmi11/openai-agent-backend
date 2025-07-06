import z from 'zod';
import { pgPool } from '../../lib/pg/client.js';
import { getEmbedding } from './openai-embedding.util.js';

export async function getSearchPersonalInfoTool() {
  const { tool } = await import('@openai/agents');
  return tool({
    name: 'searchPersonalInfo',
    description: 'Searches personal information by semantic similarity',
    parameters: z.object({
      question: z.string().describe('The user question about Hector'),
      match_threshold: z.number().optional().default(0.2), // Puedes tunear el valor
      match_count: z.number().optional().default(3),
    }) as any,
    execute: async ({
      question,
      match_threshold = 0.2,
      match_count = 3,
    }: {
      question: string;
      match_threshold?: number;
      match_count?: number;
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
      const result = await pgPool.query(sql, [embeddingStr, 0.9999, 10]);

      // Recorta el contenido para no exceder 10KB si es necesario
      const resultsfined = result.rows.map((row: any) => ({
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
}
