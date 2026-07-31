/**
 * Basic profanity filter for open, unauthenticated comment fields (news
 * article comments + guest display names). Deliberately simple — a
 * conservative word-list check, not an attempt to catch every leetspeak/
 * spacing evasion. Good enough as a first line of defence on a public
 * write endpoint; if this needs to get smarter later (fuzzy matching,
 * per-language lists, a moderation queue), that's a separate piece of
 * work on top of this.
 *
 * Word-boundary matched so it doesn't trip on innocent substrings
 * (e.g. "assassin", "classic", "Scunthorpe").
 */
const BLOCKED_TERMS = [
  'fuck',
  'shit',
  'bitch',
  'asshole',
  'bastard',
  'cunt',
  'dick',
  'piss',
  'slut',
  'whore',
  'nigger',
  'nigga',
  'faggot',
  'fag',
  'retard',
  'rape',
  'twat',
  'wanker',
  'motherfucker',
];

const BLOCKED_PATTERN = new RegExp(`\\b(${BLOCKED_TERMS.join('|')})\\b`, 'i');

export function containsProfanity(text: string): boolean {
  if (!text) return false;
  return BLOCKED_PATTERN.test(text);
}
