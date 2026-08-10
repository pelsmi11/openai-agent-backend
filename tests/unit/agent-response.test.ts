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

  it('turns claims about missing evidence into not_documented', () => {
    const result = validateAnswerPayload(
      ['¿Cuál es la edad exacta?'],
      [
        {
          questionIndex: 0,
          answer: 'No se especifica la edad exacta.',
          claims: [
            {
              text: 'No se especifica la edad exacta en las fuentes.',
              evidenceLevel: 'mentioned',
              sourceIds: ['related'],
            },
          ],
        },
      ],
      [evidence('related', 0, 'Experiencia profesional de Héctor Martínez.')],
      'es',
    );

    expect(result.answerParts[0]).toMatchObject({
      status: 'not_documented',
      answer: 'No tengo ese dato documentado.',
      claims: [],
    });
    expect(result.sources).toEqual([]);
  });

  it('rejects numeric answers when the requested number is absent from cited evidence', () => {
    const result = validateAnswerPayload(
      ['¿Dirigió equipos de más de 50 personas?'],
      [
        {
          questionIndex: 0,
          answer: 'Tiene liderazgo técnico y mentoría.',
          claims: [
            {
              text: 'Tiene liderazgo técnico y mentoría.',
              evidenceLevel: 'demonstrated',
              sourceIds: ['leadership'],
            },
          ],
        },
      ],
      [evidence('leadership', 0, 'Distribuyó tareas y realizó mentoría técnica.')],
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
              text: 'Tiene experiencia con Node.js en dos contextos.',
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

  it('rejects role interest when demonstrated experience was requested', () => {
    const result = validateAnswerPayload(
      ['What demonstrated experience does Héctor have with Node.js?'],
      [
        {
          questionIndex: 0,
          answer: 'He is interested in Node.js roles.',
          claims: [
            {
              text: 'He is interested in backend roles with Node.js.',
              evidenceLevel: 'demonstrated',
              sourceIds: ['role-interest'],
            },
          ],
        },
      ],
      [evidence('role-interest', 0, 'Los roles de interés incluyen backend con Node.js.')],
      'en',
    );

    expect(result.answerParts[0]?.status).toBe('not_documented');
    expect(result.sources).toEqual([]);
  });

  it('drops unrelated negative facts that were not requested', () => {
    const result = validateAnswerPayload(
      ['Dans quelles entreprises Héctor a-t-il travaillé ?'],
      [
        {
          questionIndex: 0,
          answer: "Il n’a pas encore travaillé dans une équipe internationale.",
          claims: [
            {
              text: "Il n’a pas encore travaillé dans une équipe internationale.",
              evidenceLevel: 'mentioned',
              sourceIds: ['international'],
            },
          ],
        },
      ],
      [evidence('international', 0, 'Todavía no ha trabajado en un equipo internacional.')],
      'fr',
    );

    expect(result.answerParts[0]?.status).toBe('not_documented');
    expect(result.sources).toEqual([]);
  });

  it('treats Italian absence wording as not documented', () => {
    const result = validateAnswerPayload(
      ['In quali aziende ha lavorato Héctor Martínez?'],
      [
        {
          questionIndex: 0,
          answer: 'Non sono indicate aziende specifiche.',
          claims: [
            {
              text: 'Non sono indicate aziende specifiche.',
              evidenceLevel: 'mentioned',
              sourceIds: ['generic'],
            },
          ],
        },
      ],
      [evidence('generic', 0, 'Esperienza professionale generica.')],
      'it',
    );

    expect(result.answerParts[0]?.status).toBe('not_documented');
  });

  it('preserves the official Ministerio Público name across languages', () => {
    const result = validateAnswerPayload(
      ['Dans quelles entreprises Héctor a-t-il travaillé ?'],
      [
        {
          questionIndex: 0,
          answer: 'Il a travaillé au Ministère public du Guatemala.',
          claims: [
            {
              text: 'Il a travaillé au Ministère public du Guatemala.',
              evidenceLevel: 'demonstrated',
              sourceIds: ['employment'],
            },
          ],
        },
      ],
      [evidence('employment', 0, 'Héctor trabajó en el Ministerio Público de Guatemala.')],
      'fr',
    );

    expect(result.answerParts[0]?.answer).toContain('Ministerio Público de Guatemala');
  });

  it('always treats private profile questions as not documented', () => {
    const result = validateAnswerPayload(
      ['¿Cuál es la dirección residencial exacta de Héctor?'],
      [
        {
          questionIndex: 0,
          answer: 'No se proporciona la dirección.',
          claims: [
            {
              text: 'No se proporciona la dirección residencial exacta.',
              evidenceLevel: 'mentioned',
              sourceIds: ['unrelated'],
            },
          ],
        },
      ],
      [evidence('unrelated', 0, 'Perfil profesional de Héctor.')],
      'es',
    );

    expect(result.answerParts[0]).toMatchObject({
      status: 'not_documented',
      answer: 'No tengo ese dato documentado.',
      claims: [],
    });
    expect(result.sources).toEqual([]);
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
