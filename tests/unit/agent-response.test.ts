import { describe, expect, it } from 'vitest';
import {
  renderReply,
  validateAnswerPayload,
  type DraftAnswerPart,
  type IndexedRetrievalResult,
} from '../../src/feature/booking/agent-response.js';
import { missingAnswerForLanguage } from '../../src/feature/booking/response-language.js';

const evidence = (
  id: string,
  questionIndex: number,
  content: string,
): IndexedRetrievalResult => ({
  id,
  questionIndex,
  content,
  category: 'experience',
  similarity: 0.82,
});

describe('validateAnswerPayload', () => {
  it('creates one part per question and marks missing evidence', () => {
    const result = validateAnswerPayload(
      ['¿Cuántos microservicios?', '¿Cuál es su salario?'],
      [
        {
          questionIndex: 0,
          answer: 'Ha desarrollado aproximadamente 25.',
          claims: [
            {
              text: 'Desarrolló aproximadamente 25 microservicios.',
              evidenceLevel: 'demonstrated',
              sourceIds: ['source-1'],
            },
          ],
        },
      ],
      [evidence('source-1', 0, 'Desarrolló aproximadamente 25 microservicios.')],
      'es',
    );

    expect(result.answerParts).toHaveLength(2);
    expect(result.answerParts[0]?.status).toBe('answered');
    expect(result.answerParts[1]).toMatchObject({
      status: 'not_documented',
      answer: 'No tengo ese dato documentado.',
    });
  });

  it('removes invented source ids and unsupported claims', () => {
    const drafts: DraftAnswerPart[] = [
      {
        questionIndex: 0,
        answer: 'Inventado',
        claims: [{ text: 'Inventado', evidenceLevel: 'domain', sourceIds: ['fake-id'] }],
      },
    ];
    const result = validateAnswerPayload(
      ['Pregunta'],
      drafts,
      [evidence('real-id', 0, 'Dato real')],
      'es',
    );
    expect(result.answerParts[0]?.status).toBe('not_documented');
    expect(result.sources).toEqual([]);
  });

  it('downgrades domain without explicit mastery or two independent sources', () => {
    const result = validateAnswerPayload(
      ['Node.js'],
      [
        {
          questionIndex: 0,
          answer: 'Tiene experiencia práctica.',
          claims: [
            { text: 'Usó Node.js en un sistema.', evidenceLevel: 'domain', sourceIds: ['one'] },
          ],
        },
      ],
      [evidence('one', 0, 'Usó Node.js en un sistema institucional.')],
      'es',
    );
    expect(result.answerParts[0]?.claims[0]?.evidenceLevel).toBe('demonstrated');
  });

  it('keeps domain when two independent sources support it', () => {
    const result = validateAnswerPayload(
      ['Node.js'],
      [
        {
          questionIndex: 0,
          answer: 'Tiene dominio documentado.',
          claims: [
            {
              text: 'Tiene experiencia en dos contextos.',
              evidenceLevel: 'domain',
              sourceIds: ['one', 'two'],
            },
          ],
        },
      ],
      [evidence('one', 0, 'Usó Node.js en un sistema.'), evidence('two', 0, 'Usó Node.js en APIs.')],
      'es',
    );
    expect(result.answerParts[0]?.claims[0]?.evidenceLevel).toBe('domain');
    expect(result.sources).toHaveLength(2);
  });
});

describe('response language', () => {
  it.each([
    ['es', 'No tengo ese dato documentado.'],
    ['en', 'I do not have that information documented.'],
    ['it', 'Non dispongo di questa informazione documentata.'],
    ['de', 'Diese Information ist nicht dokumentiert.'],
    ['fr', 'Je ne dispose pas de cette information documentée.'],
  ] as const)('renders missing evidence only in %s', (language, expected) => {
    expect(missingAnswerForLanguage(language)).toBe(expected);
  });
});

describe('renderReply', () => {
  it('preserves question order in compound answers', () => {
    const reply = renderReply([
      { question: 'Primera', status: 'answered', answer: 'Uno', claims: [] },
      { question: 'Segunda', status: 'not_documented', answer: 'Sin dato', claims: [] },
    ]);
    expect(reply).toBe('- Primera: Uno\n- Segunda: Sin dato');
  });
});
