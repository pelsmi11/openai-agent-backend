import type { PersonalInfoSearchResult } from './personal-info-search.service.js';
import {
  missingAnswerForLanguage,
  type SupportedResponseLanguage,
} from './response-language.js';

export type EvidenceLevel = 'mentioned' | 'demonstrated' | 'domain';

export interface AnswerClaim {
  text: string;
  evidenceLevel: EvidenceLevel;
  sourceIds: string[];
}

export interface AnswerPart {
  question: string;
  status: 'answered' | 'not_documented';
  answer: string;
  claims: AnswerClaim[];
}

export interface PublicSource {
  id: string;
  category: string | null;
  similarity: number;
  matchedQuestionIndexes: number[];
}

export interface AgentAnswer {
  reply: string;
  answerParts: AnswerPart[];
  sources: PublicSource[];
}

export interface IndexedRetrievalResult extends PersonalInfoSearchResult {
  questionIndex: number;
}

export interface DraftAnswerPart {
  questionIndex: number;
  answer: string;
  claims: AnswerClaim[];
}

const EXPLICIT_DOMAIN_LANGUAGE =
  /\b(domina|dominio|experto|experta|expertise|mastery|proficient|proficiency)\b/i;

function normalized(value: string): string {
  return value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}

function namedEntityAnchors(question: string): string[] {
  return (question.match(/\b[\p{Lu}][\p{L}]+(?:\s+[\p{Lu}][\p{L}]+)+/gu) ?? []).filter(
    (anchor) => normalized(anchor) !== 'hector martinez',
  );
}

export function validateAnswerPayload(
  questions: string[],
  drafts: DraftAnswerPart[],
  retrieved: IndexedRetrievalResult[],
  responseLanguage: SupportedResponseLanguage,
): Pick<AgentAnswer, 'answerParts' | 'sources'> {
  const answerParts: AnswerPart[] = questions.map((question, questionIndex) => {
    const evidence = retrieved.filter((row) => row.questionIndex === questionIndex);
    const allowedIds = new Set(evidence.map((row) => row.id));
    const draft = drafts.find((item) => item.questionIndex === questionIndex);
    const anchors = namedEntityAnchors(question);

    const claims = (draft?.claims ?? [])
      .map((claim) => {
        const sourceIds = [...new Set(claim.sourceIds.filter((id) => allowedIds.has(id)))];
        if (sourceIds.length === 0 || claim.text.trim().length === 0) return null;
        const sourceRows = evidence.filter((row) => sourceIds.includes(row.id));
        if (
          anchors.length > 0 &&
          !anchors.every((anchor) =>
            sourceRows.some((row) => normalized(row.content).includes(normalized(anchor))),
          )
        ) {
          return null;
        }

        let evidenceLevel = claim.evidenceLevel;
        if (evidenceLevel === 'domain') {
          const explicitlyDocumented = sourceRows.some((row) =>
            EXPLICIT_DOMAIN_LANGUAGE.test(row.content),
          );
          if (!explicitlyDocumented && sourceIds.length < 2) evidenceLevel = 'demonstrated';
        }

        return { text: claim.text.trim(), evidenceLevel, sourceIds } satisfies AnswerClaim;
      })
      .filter((claim): claim is AnswerClaim => claim !== null);

    if (evidence.length === 0 || claims.length === 0) {
      return {
        question,
        status: 'not_documented',
        answer: missingAnswerForLanguage(responseLanguage),
        claims: [],
      };
    }

    return {
      question,
      status: 'answered',
      // Render from the validated claims so the public reply cannot omit qualifiers or
      // concrete facts that are present in its own evidence metadata.
      answer: claims.map((claim) => claim.text).join(' '),
      claims,
    };
  });

  const citedIds = new Set(answerParts.flatMap((part) => part.claims.flatMap((claim) => claim.sourceIds)));
  const sourceMap = new Map<string, PublicSource>();
  for (const row of retrieved) {
    if (!citedIds.has(row.id)) continue;
    const existing = sourceMap.get(row.id);
    if (!existing) {
      sourceMap.set(row.id, {
        id: row.id,
        category: row.category,
        similarity: row.similarity,
        matchedQuestionIndexes: [row.questionIndex],
      });
      continue;
    }
    existing.similarity = Math.max(existing.similarity, row.similarity);
    if (!existing.matchedQuestionIndexes.includes(row.questionIndex)) {
      existing.matchedQuestionIndexes.push(row.questionIndex);
      existing.matchedQuestionIndexes.sort((a, b) => a - b);
    }
  }

  return { answerParts, sources: [...sourceMap.values()] };
}

export function renderReply(answerParts: AnswerPart[]): string {
  if (answerParts.length === 1) return answerParts[0]?.answer ?? '';
  return answerParts.map((part) => `- ${part.question}: ${part.answer}`).join('\n');
}
