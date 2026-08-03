import { Annotation, END, Send, START, StateGraph, messagesStateReducer } from '@langchain/langgraph';
import { ToolNode, toolsCondition } from '@langchain/langgraph/prebuilt';
import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres';
import {
  AIMessage,
  HumanMessage,
  SystemMessage,
  type BaseMessage,
} from '@langchain/core/messages';
import { z } from 'zod';
import { chatModel } from '../../lib/ai-gateway/models.js';
import { CONFIG } from '../../utils/constants/config.js';
import { scheduleMeetingTool } from './agent-tools.js';
import {
  renderReply,
  validateAnswerPayload,
  type AnswerPart,
  type DraftAnswerPart,
  type IndexedRetrievalResult,
  type PublicSource,
} from './agent-response.js';
import {
  inferPersonalInfoCategories,
  searchPersonalInfo,
  searchPersonalInfoByCategories,
} from './personal-info-search.service.js';
import {
  strictLanguageInstruction,
  SUPPORTED_RESPONSE_LANGUAGES,
  type SupportedResponseLanguage,
} from './response-language.js';

type AgentIntent = 'candidate_profile' | 'meeting' | 'out_of_scope';

interface SubQuestion {
  index: number;
  question: string;
  retrievalQuery: string;
}

const StateAnnotation = Annotation.Root({
  messages: Annotation<BaseMessage[], BaseMessage | BaseMessage[]>({
    reducer: messagesStateReducer,
    default: () => [],
  }),
  intent: Annotation<AgentIntent>(),
  responseLanguage: Annotation<SupportedResponseLanguage>(),
  subQuestions: Annotation<SubQuestion[]>(),
  activeQuestion: Annotation<SubQuestion>(),
  retrievalResults: Annotation<IndexedRetrievalResult[]>({
    reducer: (current, update) => (update.length === 0 ? [] : current.concat(update)),
    default: () => [],
  }),
  answerParts: Annotation<AnswerPart[]>(),
  sources: Annotation<PublicSource[]>(),
});

const IntentSchema = z.object({
  intent: z.enum(['candidate_profile', 'meeting', 'out_of_scope']),
  responseLanguage: z.enum(SUPPORTED_RESPONSE_LANGUAGES),
});

const DecompositionSchema = z.object({
  questions: z
    .array(
      z.object({
        question: z.string().trim().min(1),
        retrievalQuery: z.string().trim().min(1),
      }),
    )
    .min(1)
    .max(5),
});

const DraftAnswerSchema = z.object({
  answerParts: z.array(
    z.object({
      questionIndex: z.number().int().min(0),
      answer: z.string(),
      claims: z.array(
        z.object({
          text: z.string(),
          evidenceLevel: z.enum(['mentioned', 'demonstrated', 'domain']),
          sourceIds: z.array(z.string()),
        }),
      ),
    }),
  ),
});

const intentModel = chatModel.withStructuredOutput(IntentSchema, { name: 'classify_intent' });
const decompositionModel = chatModel.withStructuredOutput(DecompositionSchema, {
  name: 'decompose_candidate_question',
});
const synthesisModel = chatModel.withStructuredOutput(DraftAnswerSchema, {
  name: 'synthesize_grounded_answer',
});
const meetingModel = chatModel.bindTools([scheduleMeetingTool]);

function messageText(message: BaseMessage | undefined): string {
  if (!message) return '';
  return typeof message.content === 'string' ? message.content : JSON.stringify(message.content);
}

function latestHumanMessage(state: typeof StateAnnotation.State): HumanMessage {
  const message = [...state.messages].reverse().find(HumanMessage.isInstance);
  if (!message) throw new Error('No user message was provided');
  return message;
}

function recentConversation(state: typeof StateAnnotation.State): string {
  return state.messages
    .slice(-6)
    .map((message) => `${HumanMessage.isInstance(message) ? 'User' : 'Assistant'}: ${messageText(message)}`)
    .join('\n');
}

async function classifyIntent(state: typeof StateAnnotation.State) {
  const latestMessage = messageText(latestHumanMessage(state));
  const result = await intentModel.invoke([
    new SystemMessage(
      'Classify the latest request. candidate_profile means any question explicitly naming Héctor Martínez, including private or unsupported facts that may not be documented, plus professional questions that are implicitly about him in this portfolio context (skills, scale, security, continuity, experience, evaluation). meeting means an explicit request to schedule or a continuation that supplies meeting details. out_of_scope is only for requests clearly unrelated to Héctor or his professional profile. Use the recent conversation to resolve short follow-ups. Never classify as meeting merely because several messages have been exchanged. Also set responseLanguage to the language used by the latest user message: es for Spanish, en for English, it for Italian, de for German, or fr for French. If the latest message contains only language-neutral data such as an email, date, URL, or technology name, preserve the language of the most recent substantive user message. If a message mixes languages, choose its dominant language or the language it explicitly requests. Never infer responseLanguage from assistant messages or retrieved evidence.',
    ),
    new HumanMessage(recentConversation(state)),
  ]);
  const explicitlyAboutHector = /\bh[eé]ctor\b/i.test(latestMessage);
  return {
    intent:
      result.intent === 'out_of_scope' && explicitlyAboutHector
        ? ('candidate_profile' as const)
        : result.intent,
    responseLanguage: result.responseLanguage,
  };
}

function routeIntent(state: typeof StateAnnotation.State): AgentIntent {
  return state.intent;
}

async function decomposeQuestion(state: typeof StateAnnotation.State) {
  const userQuestion = messageText(latestHumanMessage(state));
  const languageRule = strictLanguageInstruction(state.responseLanguage);
  const decompositionPrompt =
    `Decompose the user request into 1 to 5 self-contained questions. ${languageRule} For every item, question is user-visible and must use TARGET_LANGUAGE; retrievalQuery is internal and must be written in Spanish for the Spanish-language corpus, explicitly name Héctor Martínez, and add only useful professional synonyms such as education/title/university or current role/position/employer without assuming the answer. Preserve every requested fact, comparison, uncertainty, and recruiter criterion in the original order. When the user enumerates N distinct items or asks to answer separately, return exactly N items. A simple request must remain one item. Do not add answer targets the user did not request.`;
  let result = await decompositionModel.invoke([
    new SystemMessage(
      decompositionPrompt,
    ),
    new HumanMessage(userQuestion),
  ]);

  const firstSentence = userQuestion.split('?')[0] ?? userQuestion;
  const enumeratedCount = /por separado|separately|separatamente|séparément|getrennt|einzeln/i.test(userQuestion)
    ? firstSentence.split(/,\s*|\s+(?:y|and|e|et|und)\s+/i).length
    : 1;
  const expectedMinimum = /distingue|distinguish|distingui|distinguer|unterscheide/i.test(userQuestion)
    ? Math.max(2, enumeratedCount)
    : enumeratedCount;
  if (result.questions.length < expectedMinimum) {
    result = await decompositionModel.invoke([
      new SystemMessage(
        `${decompositionPrompt} The request below contains ${expectedMinimum} distinct answer targets. Return exactly ${expectedMinimum} items; do not merge them. ${languageRule}`,
      ),
      new HumanMessage(userQuestion),
    ]);
  }
  if (result.questions.length < expectedMinimum && /cada\s+\w+\s+por separado/i.test(userQuestion)) {
    const enumeratedNames = [...new Set(firstSentence.match(/\b[A-Z][A-Za-z0-9.-]{1,}\b/g) ?? [])];
    if (enumeratedNames.length === expectedMinimum) {
      result = {
        questions: enumeratedNames.map((name) => ({
          question: `¿Cómo ha usado ${name} Héctor Martínez?`,
          retrievalQuery: `Uso documentado de ${name} por Héctor Martínez en proyectos y arquitectura`,
        })),
      };
    }
  }

  const uniqueQuestions = result.questions.filter(
    (item, index, items) =>
      items.findIndex((candidate) => candidate.question.trim() === item.question.trim()) === index,
  );
  const questions = (
    uniqueQuestions.length > 0
      ? uniqueQuestions
      : [{ question: userQuestion, retrievalQuery: `Héctor Martínez ${userQuestion}` }]
  ).map((item, index) => ({
    index,
    question: item.question.trim(),
    retrievalQuery: item.retrievalQuery.trim(),
  }));
  return { subQuestions: questions };
}

function dispatchRetrievals(state: typeof StateAnnotation.State) {
  return state.subQuestions.map(
    (question) => new Send('retrieve', { activeQuestion: question }),
  );
}

async function retrieveEvidence(state: typeof StateAnnotation.State) {
  const question = state.activeQuestion;
  const [rows, categoryRows] = await Promise.all([
    searchPersonalInfo(question.retrievalQuery),
    searchPersonalInfoByCategories(
      question.retrievalQuery,
      inferPersonalInfoCategories(question.retrievalQuery),
    ),
  ]);
  return {
    retrievalResults: [...rows, ...categoryRows].map((row) => ({
      ...row,
      questionIndex: question.index,
    })),
  };
}

function dedupeEvidence(rows: IndexedRetrievalResult[]): IndexedRetrievalResult[] {
  const deduped = new Map<string, IndexedRetrievalResult>();
  for (const row of rows) {
    const key = `${row.questionIndex}:${row.id}`;
    const existing = deduped.get(key);
    if (!existing || row.similarity > existing.similarity) deduped.set(key, row);
  }
  return [...deduped.values()];
}

async function synthesizeAnswer(state: typeof StateAnnotation.State) {
  const userMessage = messageText(latestHumanMessage(state));
  const languageRule = strictLanguageInstruction(state.responseLanguage);
  let evidence = dedupeEvidence(state.retrievalResults);

  const createDraft = async (rows: IndexedRetrievalResult[]) => {
    const evidencePayload = state.subQuestions.map((question) => ({
      questionIndex: question.index,
      question: question.question,
      sources: rows
        .filter((row) => row.questionIndex === question.index)
        .map((row) => ({
          id: row.id,
          category: row.category,
          similarity: row.similarity,
          content: row.content,
        })),
    }));
    return synthesisModel.invoke([
      new SystemMessage(
        `Answer each subquestion using only its supplied sources. ${languageRule} Return one answerPart for every questionIndex and preserve order. Every factual claim must cite one or more sourceIds from that same subquestion. Use mentioned when a source only names a skill, demonstrated when it contains a concrete project/responsibility/result, and domain only for explicit mastery or multiple independent demonstrations. Evidence that is merely related is insufficient: if the question asks for an exact quantity, duration, guarantee, salary, identity detail, named organization, named service, or other exact fact, return no claims unless a source explicitly contains that exact fact or name. If the evidence does not directly answer a subquestion, return no claims. Never infer missing facts. Before returning, verify that every question, answer, and claim is entirely in TARGET_LANGUAGE and rewrite any mixed-language text.`,
      ),
      new HumanMessage(JSON.stringify({ originalQuestion: userMessage, evidence: evidencePayload })),
    ]);
  };

  let draft = await createDraft(evidence);
  let validated = validateAnswerPayload(
    state.subQuestions.map((question) => question.question),
    draft.answerParts as DraftAnswerPart[],
    evidence,
    state.responseLanguage,
  );

  // A calibrated 0.625 threshold is the normal path. If that path cannot answer a
  // subquestion, make one bounded recall pass down to 0.50 and let the grounded
  // synthesizer reject merely related rows. This avoids globally weakening precision.
  const missingIndexes = validated.answerParts
    .map((part, index) => (part.status === 'not_documented' ? index : -1))
    .filter((index) => index >= 0);
  if (missingIndexes.length > 0) {
    const fallbackRows = await Promise.all(
      missingIndexes.map(async (questionIndex) => {
        const question = state.subQuestions[questionIndex];
        if (!question) return [];
        const rows = await searchPersonalInfo(question.retrievalQuery, {
          minSimilarity: 0.5,
          matchCount: 10,
        });
        const categories = inferPersonalInfoCategories(question.retrievalQuery);
        const categoryRows = await searchPersonalInfoByCategories(
          question.retrievalQuery,
          categories,
        );
        return [...rows, ...categoryRows].map((row) => ({ ...row, questionIndex }));
      }),
    );
    const expandedEvidence = dedupeEvidence([...evidence, ...fallbackRows.flat()]);
    if (expandedEvidence.length > evidence.length) {
      evidence = expandedEvidence;
      draft = await createDraft(evidence);
      validated = validateAnswerPayload(
        state.subQuestions.map((question) => question.question),
        draft.answerParts as DraftAnswerPart[],
        evidence,
        state.responseLanguage,
      );
    }
  }
  const reply = renderReply(validated.answerParts);
  return {
    messages: [new AIMessage(reply)],
    answerParts: validated.answerParts,
    sources: validated.sources,
  };
}

async function respondOutOfScope(state: typeof StateAnnotation.State) {
  const userMessage = messageText(latestHumanMessage(state));
  const languageRule = strictLanguageInstruction(state.responseLanguage);
  const response = await chatModel.invoke([
    new SystemMessage(
      `Politely explain that you can only answer questions about Héctor Martínez as a professional candidate or help with an explicitly requested meeting. ${languageRule} Keep the response to two sentences and do not offer a meeting unless the user asked for one. Before returning, rewrite any mixed-language text.`,
    ),
    new HumanMessage(userMessage),
  ]);
  return { messages: [response], answerParts: [], sources: [] };
}

function todayContext(): string {
  const now = new Date();
  return `Today is ${now.toISOString()} (UTC). Resolve relative dates into a future ISO 8601 value with an explicit timezone offset.`;
}

async function meetingAgent(state: typeof StateAnnotation.State) {
  const languageRule = strictLanguageInstruction(state.responseLanguage);
  const response = await meetingModel.invoke([
    new SystemMessage(
      `Help with scheduling only because the user explicitly requested it. ${languageRule} Ask for any missing email, date/time, timezone, duration, and reason. Translate tool errors and confirmations into TARGET_LANGUAGE. Do not call scheduleMeeting until its schema is satisfied. Never claim success unless the tool returns confirmed=true. Before returning, rewrite any mixed-language text. ${todayContext()}`,
    ),
    ...state.messages,
  ]);
  return { messages: [response], answerParts: [], sources: [] };
}

const meetingTools = new ToolNode([scheduleMeetingTool]);
const checkpointer = PostgresSaver.fromConnString(CONFIG.DATABASE_URL);
let setupDone: Promise<void> | undefined;

export function setupAgentGraph(): Promise<void> {
  if (!setupDone) setupDone = checkpointer.setup();
  return setupDone;
}

const graph = new StateGraph(StateAnnotation)
  .addNode('classify', classifyIntent)
  .addNode('decompose', decomposeQuestion)
  .addNode('retrieve', retrieveEvidence)
  .addNode('synthesize', synthesizeAnswer)
  .addNode('outOfScope', respondOutOfScope)
  .addNode('meetingAgent', meetingAgent)
  .addNode('meetingTools', meetingTools)
  .addEdge(START, 'classify')
  .addConditionalEdges('classify', routeIntent, {
    candidate_profile: 'decompose',
    meeting: 'meetingAgent',
    out_of_scope: 'outOfScope',
  })
  .addConditionalEdges('decompose', dispatchRetrievals, ['retrieve'])
  .addEdge('retrieve', 'synthesize')
  .addEdge('synthesize', END)
  .addEdge('outOfScope', END)
  .addConditionalEdges('meetingAgent', toolsCondition, { tools: 'meetingTools', [END]: END })
  .addEdge('meetingTools', 'meetingAgent')
  .compile({ checkpointer });

export interface AgentRunResult {
  reply: string;
  answerParts: AnswerPart[];
  sources: PublicSource[];
}

export async function runAgent(message: string, threadId: string): Promise<AgentRunResult> {
  const result = await graph.invoke(
    {
      messages: [new HumanMessage(message)],
      subQuestions: [],
      retrievalResults: [],
      answerParts: [],
      sources: [],
    },
    { configurable: { thread_id: threadId } },
  );
  const lastMessage = result.messages[result.messages.length - 1];
  return {
    reply: messageText(lastMessage),
    answerParts: result.answerParts ?? [],
    sources: result.sources ?? [],
  };
}

export async function* streamAgent(
  message: string,
  threadId: string,
): AsyncGenerator<string, AgentRunResult> {
  const result = await runAgent(message, threadId);
  const chunks = result.reply.match(/\S+\s*/g) ?? [result.reply];
  for (const chunk of chunks) yield chunk;
  return result;
}
