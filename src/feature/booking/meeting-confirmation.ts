const NEGATED_MEETING_CONFIRMATION =
  /\b(?:no\s+(?:lo\s+)?confirmo|todav[ií]a\s+no|a[uú]n\s+no|no\s+agend(?:es|ar)|do\s+not\s+(?:confirm|book|schedule)|not\s+yet|non\s+confermo|non\s+ancora|nicht\s+best[aä]tigen|noch\s+nicht|ne\s+confirme\s+pas|pas\s+encore)\b/i;
const EXPLICIT_MEETING_CONFIRMATION =
  /\b(?:s[ií],?\s*(?:confirmo|agenda|ag[eé]ndala)|confirmo\s+(?:la\s+)?(?:reuni[oó]n|reserva)|puedes\s+agendar|agenda\s+(?:la\s+)?reuni[oó]n|i\s+confirm|yes,?\s*(?:book|schedule)|book\s+the\s+meeting|confermo|s[iì],?\s*(?:prenota|confermo)|ich\s+best[aä]tige|ja,?\s*(?:buche|plane)|je\s+confirme|oui,?\s*(?:r[eé]serve|planifie))\b/i;

export function isExplicitMeetingConfirmation(message: string): boolean {
  return !NEGATED_MEETING_CONFIRMATION.test(message) && EXPLICIT_MEETING_CONFIRMATION.test(message);
}

export function containsPendingMeetingNotice(message: string): boolean {
  return /no\s+se\s+ha\s+(?:agendado|reservado)|no\s+est[aá]\s+agendada|no\s+meeting\s+has\s+been\s+(?:booked|scheduled)|non\s+(?:e|è)\s+stata\s+prenotata|(?:noch\s+)?kein\s+termin\s+(?:wurde\s+)?gebucht|aucune\s+r[eé]union\s+n['’]\s*a\s+[eé]t[eé]\s+r[eé]serv[eé]e/i.test(message);
}
