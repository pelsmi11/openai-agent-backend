import { describe, expect, it } from 'vitest';
import {
  containsPendingMeetingNotice,
  isExplicitMeetingConfirmation,
} from '../../src/feature/booking/meeting-confirmation.js';
import {
  detectResponseLanguage,
  pendingMeetingMessageForLanguage,
  progressMessageForLanguage,
} from '../../src/feature/booking/response-language.js';

describe('response language routing', () => {
  it.each([
    ['¿Qué experiencia tiene Héctor?', 'es'],
    ['What experience does Héctor have?', 'en'],
    ['In quali aziende ha lavorato Héctor?', 'it'],
    ['Bei welchen Unternehmen hat Héctor gearbeitet?', 'de'],
    ['Dans quelles entreprises Héctor a-t-il travaillé ?', 'fr'],
  ] as const)('detects %s as %s', (message, expected) => {
    expect(detectResponseLanguage(message)).toBe(expected);
  });

  it('provides a localized progress message', () => {
    expect(progressMessageForLanguage('fr')).toContain('documentée');
    expect(progressMessageForLanguage('de')).toContain('dokumentierte');
  });

  it('provides a deterministic pending-booking notice', () => {
    expect(pendingMeetingMessageForLanguage('es')).toContain('No se ha agendado');
    expect(pendingMeetingMessageForLanguage('it')).toContain('Non è stata prenotata');
  });
});

describe('meeting confirmation gate', () => {
  it.each([
    'Sí, confirmo la reunión.',
    'I confirm the meeting.',
    'Confermo la riunione.',
    'Ich bestätige den Termin.',
    'Je confirme la réunion.',
  ])('accepts an explicit confirmation: %s', (message) => {
    expect(isExplicitMeetingConfirmation(message)).toBe(true);
  });

  it.each([
    'Todavía no confirmo ninguna reserva.',
    'Do not schedule it yet.',
    'Non confermo ancora.',
    'Noch nicht bestätigen.',
    'Je ne confirme pas encore.',
  ])('rejects a negated confirmation: %s', (message) => {
    expect(isExplicitMeetingConfirmation(message)).toBe(false);
  });

  it('recognizes an existing pending notice to avoid duplication', () => {
    expect(containsPendingMeetingNotice('Por ahora, no se ha reservado ninguna reunión.')).toBe(true);
    expect(containsPendingMeetingNotice('No meeting has been booked.')).toBe(true);
  });
});
