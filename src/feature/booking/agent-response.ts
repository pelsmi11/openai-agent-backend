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
const DEMONSTRATED_LANGUAGE =
  /\b(?:desarroll\w*|implement\w*|lider\w*|disen\w*|cre(?:o|ando|ated?)\w*|migr\w*|optimiz\w*|manten\w*|integr\w*|utiliz\w*|us(?:o|ed)\w*|trabaj\w*|particip\w*|gestion\w*|supervis\w*|resolv\w*|constru\w*|configur\w*|despleg\w*|automatiz\w*|develop\w*|led|built|designed|migrated|maintain\w*|worked|managed|deployed|svilupp\w*|lavor\w*|guid\w*|entwick\w*|gearbeit\w*|geleitet|developp\w*|travaill\w*|dirig\w*)\b/i;
const REQUESTS_DEMONSTRATED =
  /\b(?:demostrad[ao]s?|demonstrated|dimostrat[aoe]?|nachgewiesen\w*|demontree?s?)\b/i;
const PRIVATE_OR_UNDOCUMENTED_QUESTION =
  /\b(?:salario|expectativa salarial|sueldo|edad exacta|estado civil|direcci[oó]n residencial|domicilio exacto|comida favorita|condici[oó]n m[eé]dica|salary|exact age|marital status|home address|residential address|favorite food|medical condition|stipendio|indirizzo di casa|stato civile|gehalt|wohnadresse|familienstand|salaire|adresse personnelle|état civil)\b/i;
const ABSENCE_CLAIM_LANGUAGE =
  /\b(?:no\s+(?:se\s+)?(?:especific\w*|indic\w*|inclu\w*|document\w*|mencion\w*|dispon\w*|consta\w*|proporcion\w*|facilit\w*|detall\w*|revel\w*|public\w*)|no\s+hay|las\s+fuentes\s+no|la\s+evidencia\s+no|not\s+documented|does\s+not\s+(?:specify|indicate|include|mention|provide)|has\s+not|no\s+evidence|sources?\s+do(?:es)?\s+not|nicht\s+dokumentiert|nicht\s+angegeben|noch\s+nicht|keine\s+(?:angabe|evidenz)|non\s+(?:(?:e|è)\s+)?(?:documentato|specificato|indicato)|non\s+(?:sono\s+)?indicat\w*|non\s+ha|nessuna\s+evidenza|pas\s+document\w*|non\s+indique|aucune\s+preuve|n['’]\s*a\s+pas|n['’]\s*est\s+pas|ne\s+\w+\s+pas)\b/i;

const QUESTION_STOPWORDS = new Set([
  'hector', 'martinez', 'what', 'which', 'where', 'does', 'have', 'with', 'about',
  'answer', 'only', 'separately', 'que', 'cual', 'como', 'donde', 'tiene', 'responde',
  'solo', 'separado', 'quale', 'quali', 'dove', 'rispondi', 'welche', 'welchen',
  'antwort', 'quel', 'quelle', 'quelles', 'reponds', 'uniquement',
]);

function normalized(value: string): string {
  return value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}

function namedEntityAnchors(question: string): string[] {
  return (question.match(/\b[\p{Lu}][\p{L}]+(?:\s+[\p{Lu}][\p{L}]+)+/gu) ?? []).filter(
    (anchor) => normalized(anchor) !== 'hector martinez',
  );
}

function numericAnchors(value: string): string[] {
  return [...new Set((value.match(/\b\d[\d.,]*\b/g) ?? []).map((number) => number.replace(/\D/g, '')))];
}

function relevantTerms(value: string): string[] {
  return normalized(value)
    .replace(/[^a-z0-9\s.-]/g, ' ')
    .split(/\s+/)
    .filter((term) => term.length >= 4 && !QUESTION_STOPWORDS.has(term));
}

function claimTargetsQuestion(question: string, claim: string): boolean {
  const normalizedQuestion = normalized(question);
  const normalizedClaim = normalized(claim);
  if (/\betl\b/.test(normalizedQuestion) && /\betl\b/.test(normalizedClaim)) return true;
  if (
    /base(?:s)? de datos|database|datenbank|banca dati|base de donnees/.test(normalizedQuestion) &&
    /base(?:s)? de datos|database|datenbank|banca dati|base de donnees|sql server|postgres|mysql|mongodb|data warehouse/.test(normalizedClaim)
  ) return true;
  if (
    /empleador|empresa|compania|institucion|compan(?:y|ies)|azienda|entreprise|unternehmen|trabaj|worked|lavor|travaill|gearbeit/.test(normalizedQuestion) &&
    /ministerio|fundacion|genesis|justice|sociedad|institucion|organizacion|compan|empresa|azienda|entreprise|unternehmen|trabaj|worked|lavor|travaill|gearbeit/.test(normalizedClaim)
  ) return true;

  const questionTerms = relevantTerms(question);
  if (questionTerms.length === 0) return true;
  const claimTerms = relevantTerms(claim);
  return questionTerms.some((questionTerm) =>
    claimTerms.some((claimTerm) =>
      questionTerm.slice(0, 5) === claimTerm.slice(0, 5),
    ),
  );
}

function canonicalizeOfficialNames(value: string, sourceRows: IndexedRetrievalResult[]): string {
  let result = value;
  const sourceText = sourceRows.map((row) => row.content).join('\n');
  if (sourceText.includes('Ministerio Público')) {
    result = result.replace(
      /Minist\p{L}*\s+P[uú]blic\p{L}*(?:\s+(?:de|di|du|von)\s+Guatemala)?/giu,
      'Ministerio Público de Guatemala',
    );
    result = result.replace(
      /(?:the\s+)?Public Prosecutor['’]s Office(?:\s+of\s+Guatemala)?/giu,
      'Ministerio Público de Guatemala',
    );
  }
  return result;
}

export function validateAnswerPayload(
  questions: string[],
  drafts: DraftAnswerPart[],
  retrieved: IndexedRetrievalResult[],
  responseLanguage: SupportedResponseLanguage,
): Pick<AgentAnswer, 'answerParts' | 'sources'> {
  const answerParts: AnswerPart[] = questions.map((question, questionIndex) => {
    if (PRIVATE_OR_UNDOCUMENTED_QUESTION.test(normalized(question))) {
      return {
        question,
        status: 'not_documented',
        answer: missingAnswerForLanguage(responseLanguage),
        claims: [],
      };
    }
    const evidence = retrieved.filter((row) => row.questionIndex === questionIndex);
    const allowedIds = new Set(evidence.map((row) => row.id));
    const draft = drafts.find((item) => item.questionIndex === questionIndex);
    const anchors = namedEntityAnchors(question);
    const requestedNumbers = numericAnchors(question);
    const requiresDemonstration = REQUESTS_DEMONSTRATED.test(normalized(question));

    const claims = (draft?.claims ?? [])
      .map((claim) => {
        if (ABSENCE_CLAIM_LANGUAGE.test(normalized(claim.text))) return null;
        if (!claimTargetsQuestion(question, claim.text)) return null;
        const sourceIds = [...new Set(claim.sourceIds.filter((id) => allowedIds.has(id)))];
        if (sourceIds.length === 0 || claim.text.trim().length === 0) return null;
        const sourceRows = evidence.filter((row) => sourceIds.includes(row.id));
        if (
          requestedNumbers.length > 0 &&
          !requestedNumbers.every((number) =>
            sourceRows.some((row) => numericAnchors(row.content).includes(number)),
          )
        ) {
          return null;
        }
        if (
          anchors.length > 0 &&
          !anchors.every((anchor) =>
            sourceRows.some((row) => normalized(row.content).includes(normalized(anchor))),
          )
        ) {
          return null;
        }

        const hasDemonstratedEvidence = sourceRows.some((row) =>
          DEMONSTRATED_LANGUAGE.test(normalized(row.content)),
        );
        if (requiresDemonstration && !hasDemonstratedEvidence) return null;

        let evidenceLevel = claim.evidenceLevel;
        if (evidenceLevel === 'demonstrated' && !hasDemonstratedEvidence) {
          evidenceLevel = 'mentioned';
        }
        if (evidenceLevel === 'domain') {
          const explicitlyDocumented = sourceRows.some((row) =>
            EXPLICIT_DOMAIN_LANGUAGE.test(row.content),
          );
          const independentDemonstrations = sourceRows.filter((row) =>
            DEMONSTRATED_LANGUAGE.test(normalized(row.content)),
          ).length;
          if (!explicitlyDocumented && independentDemonstrations < 2) {
            evidenceLevel = hasDemonstratedEvidence ? 'demonstrated' : 'mentioned';
          }
        }

        return {
          text: canonicalizeOfficialNames(claim.text.trim(), sourceRows),
          evidenceLevel,
          sourceIds,
        } satisfies AnswerClaim;
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
