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

export function missingAnswerForLanguage(language: SupportedResponseLanguage): string {
  return MISSING_ANSWERS[language];
}

export function strictLanguageInstruction(language: SupportedResponseLanguage): string {
  const target = LANGUAGE_NAMES[language];
  return `TARGET_LANGUAGE=${target} (${language}). Write every user-visible word exclusively in TARGET_LANGUAGE. Translate all source material into TARGET_LANGUAGE before using it; the retrieved evidence is usually Spanish and must never determine the response language. Do not mix languages in questions, answers, claim text, explanations, or meeting messages. Proper names, official organization names, registered technology names, code, URLs, email addresses, and quoted titles may remain unchanged.`;
}
