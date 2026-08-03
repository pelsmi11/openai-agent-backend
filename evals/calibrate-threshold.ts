import { readFile, writeFile } from 'node:fs/promises';
import { getEmbedding } from '../src/feature/booking/openai-embedding.util.js';
import { pgPool } from '../src/lib/pg/client.js';

interface RelevanceCase {
  query: string;
  relevantSourceIds: string[];
}

const cases = JSON.parse(
  await readFile(new URL('./relevance-cases.json', import.meta.url), 'utf8'),
) as RelevanceCase[];
const thresholds = Array.from({ length: 17 }, (_, index) => Number((0.5 + index * 0.025).toFixed(3)));
const embedded = await Promise.all(
  cases.map(async (testCase) => ({ ...testCase, embedding: await getEmbedding(testCase.query) })),
);
const diagnostics = [];
for (const testCase of embedded) {
  const result = await pgPool.query<{ id: string; similarity: number }>(
    `SELECT id, 1 - (embedding <=> $1) AS similarity
     FROM personal_info
     WHERE visibility = true
     ORDER BY embedding <=> $1
     LIMIT 5`,
    [`[${testCase.embedding.join(',')}]`],
  );
  const found = new Set(result.rows.map((row) => row.id));
  diagnostics.push({
    query: testCase.query,
    expectedSourceIds: testCase.relevantSourceIds,
    top5: result.rows,
    missingExpectedIds: testCase.relevantSourceIds.filter((id) => !found.has(id)),
  });
}

const measurements = [];
for (const minSimilarity of thresholds) {
  let truePositive = 0;
  let falsePositive = 0;
  let falseNegative = 0;
  for (const testCase of embedded) {
    const result = await pgPool.query<{ id: string }>(
      `SELECT id
       FROM personal_info
       WHERE visibility = true
         AND 1 - (embedding <=> $1) >= $2
       ORDER BY embedding <=> $1
       LIMIT 5`,
      [`[${testCase.embedding.join(',')}]`, minSimilarity],
    );
    const found = new Set(result.rows.map((row) => row.id));
    const expected = new Set(testCase.relevantSourceIds);
    truePositive += [...found].filter((id) => expected.has(id)).length;
    falsePositive += [...found].filter((id) => !expected.has(id)).length;
    falseNegative += [...expected].filter((id) => !found.has(id)).length;
  }
  const precision = truePositive / Math.max(1, truePositive + falsePositive);
  const recallAt5 = truePositive / Math.max(1, truePositive + falseNegative);
  const f1 = (2 * precision * recallAt5) / Math.max(Number.EPSILON, precision + recallAt5);
  measurements.push({ minSimilarity, precision, recallAt5, f1 });
}

const eligible = measurements.filter((measurement) => measurement.recallAt5 >= 0.9);
eligible.sort((a, b) => b.f1 - a.f1 || b.minSimilarity - a.minSimilarity);
const selected = eligible[0];
const report = {
  generatedAt: new Date().toISOString(),
  cases: cases.length,
  selected,
  measurements,
  diagnostics,
};
await writeFile(
  new URL('./calibration-report.json', import.meta.url),
  `${JSON.stringify(report, null, 2)}\n`,
  'utf8',
);
console.log(JSON.stringify(report, null, 2));
await pgPool.end();
if (!selected) process.exitCode = 1;
