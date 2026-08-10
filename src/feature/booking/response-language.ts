export const SUPPORTED_RESPONSE_LANGUAGES = ['es', 'en', 'it', 'de', 'fr'] as const;

export type SupportedResponseLanguage = (typeof SUPPORTED_RESPONSE_LANGUAGES)[number];

const LANGUAGE_NAMES: Record<SupportedResponseLanguage, string> = {
  es: 'Spanish (español)',
  en: 'English',
  it: 'Italian (italiano)',
  de: 'German (Deutsch)',
  fr: 'French (français)',
};

const MISSING_ANSWERS: Record<SupportedResponseLanguage, string> = {
  es: 'No tengo ese dato documentado.',
  en: 'I do not have that information documented.',
  it: 'Non dispongo di questa informazione documentata.',
  de: 'Diese Information ist nicht dokumentiert.',
  fr: 'Je ne dispose pas de cette information documentée.',
};

const PROGRESS_MESSAGES: Record<SupportedResponseLanguage, string> = {
  es: 'Consultando la experiencia documentada de Héctor…',
  en: "Checking Héctor's documented experience…",
  it: "Consultando l'esperienza documentata di Héctor…",
  de: 'Ich prüfe Héctors dokumentierte Erfahrung…',
  fr: "Je consulte l'expérience documentée de Héctor…",
};

const PENDING_MEETING_MESSAGES: Record<SupportedResponseLanguage, string> = {
  es: 'No se ha agendado ninguna reunión. Cuando estén todos los datos, te pediré una confirmación explícita antes de reservarla.',
  en: 'No meeting has been booked. Once all details are available, I will ask for your explicit confirmation before booking it.',
  it: 'Non è stata prenotata alcuna riunione. Quando saranno disponibili tutti i dati, chiederò una conferma esplicita prima di prenotarla.',
  de: 'Es wurde noch kein Termin gebucht. Sobald alle Angaben vorliegen, bitte ich vor der Buchung um eine ausdrückliche Bestätigung.',
  fr: "Aucune réunion n'a été réservée. Lorsque toutes les informations seront disponibles, je demanderai une confirmation explicite avant de la réserver.",
};

const EXPLICIT_LANGUAGE_PATTERNS: Array<{
  language: SupportedResponseLanguage;
  pattern: RegExp;
}> = [
  { language: 'es', pattern: /(?:solo|únicamente|solamente)\s+en\s+español|responde\s+en\s+español/i },
  { language: 'en', pattern: /(?:only|exclusively)\s+in\s+english|answer\s+in\s+english/i },
  { language: 'it', pattern: /(?:solo|soltanto)\s+in\s+italiano|rispondi\s+in\s+italiano/i },
  { language: 'de', pattern: /(?:nur|ausschließlich)\s+auf\s+deutsch|antworte\s+(?:nur\s+)?auf\s+deutsch/i },
  { language: 'fr', pattern: /(?:uniquement|seulement)\s+en\s+français|réponds?\s+en\s+français/i },
];

const LANGUAGE_MARKERS: Record<SupportedResponseLanguage, RegExp> = {
  es: /[¿¡ñ]|\b(?:qué|cuál|cómo|dónde|experiencia|trabajado|quiero|reunión|agendar)\b/i,
  en: /\b(?:what|which|how|where|experience|worked|meeting|schedule|answer)\b/i,
  it: /\b(?:quale|quali|come|dove|esperienza|lavorato|riunione|rispondi)\b/i,
  de: /\b(?:welche|welchen|wie|wo|erfahrung|gearbeitet|termin|antworte)\b/i,
  fr: /\b(?:quel|quelle|quelles|comment|où|expérience|travaillé|réunion|réponds)\b/i,
};

export function missingAnswerForLanguage(language: SupportedResponseLanguage): string {
  return MISSING_ANSWERS[language];
}

export function detectResponseLanguage(message: string): SupportedResponseLanguage {
  const explicit = EXPLICIT_LANGUAGE_PATTERNS.find(({ pattern }) => pattern.test(message));
  if (explicit) return explicit.language;

  const scores = SUPPORTED_RESPONSE_LANGUAGES.map((language) => ({
    language,
    score: (message.match(new RegExp(LANGUAGE_MARKERS[language].source, 'gi')) ?? []).length,
  })).sort((left, right) => right.score - left.score);

  return scores[0] && scores[0].score > 0 ? scores[0].language : 'es';
}

export function progressMessageForLanguage(language: SupportedResponseLanguage): string {
  return PROGRESS_MESSAGES[language];
}

export function pendingMeetingMessageForLanguage(language: SupportedResponseLanguage): string {
  return PENDING_MEETING_MESSAGES[language];
}

export function strictLanguageInstruction(language: SupportedResponseLanguage): string {
  const target = LANGUAGE_NAMES[language];
  return `TARGET_LANGUAGE=${target} (${language}). Write every user-visible word exclusively in TARGET_LANGUAGE. Translate all source material into TARGET_LANGUAGE before using it; the retrieved evidence is usually Spanish and must never determine the response language. Do not mix languages in questions, answers, claim text, explanations, or meeting messages. Proper names, official organization names, registered technology names, code, URLs, email addresses, and quoted titles may remain unchanged.`;
}
