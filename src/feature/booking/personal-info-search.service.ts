import { pgPool } from '../../lib/pg/client.js';
import { EMBEDDING_SEARCH_DEFAULTS } from '../../utils/constants/dafultvalues.js';
import { getEmbedding } from './openai-embedding.util.js';

export interface PersonalInfoSearchResult {
  id: string;
  content: string;
  category: string | null;
  similarity: number;
}

export interface PersonalInfoSearchOptions {
  minSimilarity?: number;
  matchCount?: number;
}

function normalizeOptions(options: PersonalInfoSearchOptions) {
  const minSimilarity = options.minSimilarity ?? EMBEDDING_SEARCH_DEFAULTS.min_similarity;
  const matchCount = options.matchCount ?? EMBEDDING_SEARCH_DEFAULTS.match_count;

  if (minSimilarity < 0 || minSimilarity > 1) {
    throw new RangeError('minSimilarity must be between 0 and 1');
  }
  if (!Number.isInteger(matchCount) || matchCount < 1 || matchCount > 20) {
    throw new RangeError('matchCount must be an integer between 1 and 20');
  }

  return { minSimilarity, matchCount };
}

function mapRows(rows: Array<Record<string, unknown>>): PersonalInfoSearchResult[] {
  return rows.map((row) => ({
    id: String(row.id),
    content: String(row.content),
    category: row.category == null ? null : String(row.category),
    similarity: Number(row.similarity),
  }));
}

/**
 * Runs cosine-similarity search. During rollout it falls back to the legacy SQL function
 * when the migration has not reached a database yet; the fallback preserves the new
 * min-similarity semantics by converting it to a maximum cosine distance.
 */
export async function searchPersonalInfo(
  question: string,
  options: PersonalInfoSearchOptions = {},
): Promise<PersonalInfoSearchResult[]> {
  const { minSimilarity, matchCount } = normalizeOptions(options);
  const embedding = await getEmbedding(question);
  const embeddingString = `[${embedding.join(',')}]`;

  try {
    const result = await pgPool.query(
      'SELECT * FROM search_personal_info($1, $2, $3)',
      [embeddingString, minSimilarity, matchCount],
    );
    return mapRows(result.rows);
  } catch (error) {
    const pgCode = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
    if (pgCode !== '42883') throw error;

    const maxCosineDistance = 1 - minSimilarity;
    const legacyResult = await pgPool.query(
      'SELECT * FROM match_personal_info($1, $2, $3)',
      [embeddingString, maxCosineDistance, matchCount],
    );
    return mapRows(legacyResult.rows).filter((row) => row.similarity >= minSimilarity);
  }
}

const CATEGORY_HINTS: Array<{ pattern: RegExp; categories: string[] }> = [
  { pattern: /carrera|universidad|educaci[oó]n|t[ií]tulo|degree|studied/i, categories: ['educacion', 'formacion'] },
  { pattern: /cargo|puesto|empleador|instituci[oó]n|trabaja actualmente|current role|employer/i, categories: ['perfil', 'experiencia'] },
  { pattern: /pruebas|testing|cobertura|coverage/i, categories: ['testing', 'calidad_codigo'] },
  { pattern: /liderazgo|leadership|mentor/i, categories: ['liderazgo', 'mentoria'] },
  { pattern: /certific/i, categories: ['certificaciones'] },
  { pattern: /microserv/i, categories: ['microservicios', 'arquitectura'] },
  { pattern: /usuarios|escala|scale/i, categories: ['escala', 'faq_reclutadores'] },
  { pattern: /migr/i, categories: ['logros', 'experiencia'] },
  { pattern: /ingl[eé]s|english|idioma|language/i, categories: ['idiomas', 'experiencia_internacional'] },
  { pattern: /rag|langchain|embedding/i, categories: ['inteligencia_artificial', 'proyectos_ia', 'faq_rag'] },
  { pattern: /aws|s3|sqs|lambda|rekognition/i, categories: ['arquitectura_aws', 'proyectos_aws', 'servicios_aws', 'stack_aws'] },
];

export function inferPersonalInfoCategories(question: string): string[] {
  return [...new Set(CATEGORY_HINTS.flatMap((hint) => (hint.pattern.test(question) ? hint.categories : [])))];
}

/** Metadata-filtered recall path used only after the calibrated semantic path has no answer. */
export async function searchPersonalInfoByCategories(
  question: string,
  categories: string[],
  matchCount = 5,
): Promise<PersonalInfoSearchResult[]> {
  if (categories.length === 0) return [];
  const embedding = await getEmbedding(question);
  const result = await pgPool.query(
    `SELECT id, content, category, 1 - (embedding <=> $1) AS similarity
     FROM personal_info
     WHERE visibility = true
       AND category = ANY($2)
       AND 1 - (embedding <=> $1) >= 0.3
     ORDER BY embedding <=> $1
     LIMIT $3`,
    [`[${embedding.join(',')}]`, categories, matchCount],
  );
  return mapRows(result.rows);
}
