import { readFile } from 'node:fs/promises';

interface EvalCase {
  id: string;
  bucket: string;
  message?: string;
  turns?: string[];
  minAnswerParts?: number;
  requiredFactGroups?: string[][];
  forbiddenPhrases?: string[];
  expectAllNotDocumented?: boolean;
  expectNoMeetingOffer?: boolean;
  expectedLanguage?: 'es' | 'en' | 'it' | 'de' | 'fr';
  expectedResponseKind?: 'candidate_profile' | 'meeting' | 'out_of_scope';
}

interface ApiResponse {
  reply: string;
  conversationId: string;
  answerParts: Array<{
    status: 'answered' | 'not_documented';
    claims: Array<{ sourceIds: string[] }>;
  }>;
  sources: Array<{ id: string }>;
  responseLanguage: 'es' | 'en' | 'it' | 'de' | 'fr';
  responseKind: 'candidate_profile' | 'meeting' | 'out_of_scope';
}

const baseUrl = process.env.EVAL_BASE_URL ?? 'http://localhost:3000';
const allCases = JSON.parse(
  await readFile(new URL('./rag-cases.json', import.meta.url), 'utf8'),
) as EvalCase[];
const selectedIds = new Set(
  (process.env.EVAL_CASE_IDS ?? '').split(',').map((id) => id.trim()).filter(Boolean),
);
const cases = selectedIds.size > 0 ? allCases.filter((testCase) => selectedIds.has(testCase.id)) : allCases;

function normalize(value: string): string {
  return value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}

async function ask(message: string, conversationId?: string): Promise<ApiResponse> {
  const response = await fetch(`${baseUrl}/booking/ask-to-hector`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ message, ...(conversationId ? { conversationId } : {}) }),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${await response.text()}`);
  return (await response.json()) as ApiResponse;
}

async function runCase(testCase: EvalCase) {
  const startedAt = performance.now();
  const replies: ApiResponse[] = [];
  let conversationId: string | undefined;
  for (const message of testCase.turns ?? [testCase.message ?? '']) {
    const response = await ask(message, conversationId);
    replies.push(response);
    conversationId = response.conversationId;
  }
  const response = replies.at(-1)!;
  const failures: string[] = [];
  if ((response.answerParts?.length ?? 0) < (testCase.minAnswerParts ?? 0)) {
    failures.push(`expected at least ${testCase.minAnswerParts} answerParts`);
  }
  if (testCase.expectAllNotDocumented && response.answerParts.some((part) => part.status !== 'not_documented')) {
    failures.push('expected every answerPart to be not_documented');
  }
  if (testCase.expectedLanguage && response.responseLanguage !== testCase.expectedLanguage) {
    failures.push(`expected responseLanguage ${testCase.expectedLanguage}, received ${response.responseLanguage}`);
  }
  if (testCase.expectedResponseKind && response.responseKind !== testCase.expectedResponseKind) {
    failures.push(`expected responseKind ${testCase.expectedResponseKind}, received ${response.responseKind}`);
  }
  const normalizedReply = normalize(response.reply);
  for (const alternatives of testCase.requiredFactGroups ?? []) {
    if (!alternatives.some((fact) => normalizedReply.includes(normalize(fact)))) {
      failures.push(`missing expected fact (${alternatives.join(' | ')})`);
    }
  }
  for (const phrase of testCase.forbiddenPhrases ?? []) {
    if (normalizedReply.includes(normalize(phrase))) {
      failures.push(`contains forbidden cross-language phrase (${phrase})`);
    }
  }
  const publicIds = new Set(response.sources.map((source) => source.id));
  const citedIds = response.answerParts.flatMap((part) =>
    part.claims.flatMap((claim) => claim.sourceIds),
  );
  if (citedIds.some((id) => !publicIds.has(id))) failures.push('claim cites a source absent from sources');
  if (testCase.expectNoMeetingOffer) {
    const allText = normalize(replies.map((item) => item.reply).join('\n'));
    if (/(?:agendar|programar|reservar)\s+(?:una\s+)?reunion|(?:schedule|book|set up)\s+(?:a\s+)?meeting|would you like\s+(?:me\s+)?to\s+(?:schedule|book)|te gustaria\s+agendar/.test(allText)) {
      failures.push('agent offered a meeting without explicit intent');
    }
  }
  return {
    id: testCase.id,
    bucket: testCase.bucket,
    durationMs: Math.round(performance.now() - startedAt),
    passed: failures.length === 0,
    failures,
    ...(failures.length > 0
      ? { response: { reply: response.reply, answerParts: response.answerParts } }
      : {}),
  };
}

const results: Awaited<ReturnType<typeof runCase>>[] = [];
let nextIndex = 0;
async function worker() {
  while (nextIndex < cases.length) {
    const index = nextIndex++;
    const testCase = cases[index]!;
    const startedAt = performance.now();
    try {
      results[index] = await runCase(testCase);
    } catch (error) {
      results[index] = {
        id: testCase.id,
        bucket: testCase.bucket,
        durationMs: Math.round(performance.now() - startedAt),
        passed: false,
        failures: [error instanceof Error ? error.message : String(error)],
      };
    }
  }
}

await Promise.all([worker(), worker()]);
const failed = results.filter((result) => !result.passed);
const durations = results.map((result) => result.durationMs).sort((a, b) => a - b);
const percentile = (value: number) =>
  durations[Math.min(durations.length - 1, Math.max(0, Math.ceil(durations.length * value) - 1))] ?? 0;
console.log(JSON.stringify({
  total: results.length,
  passed: results.length - failed.length,
  passRate: results.length === 0 ? 0 : (results.length - failed.length) / results.length,
  latencyMs: {
    p50: percentile(0.5),
    p95: percentile(0.95),
    average: durations.length === 0 ? 0 : Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length),
  },
  failed,
}, null, 2));
if (failed.length > 0) process.exitCode = 1;
