const IDENTITY_QUESTION_RE =
  /\b(who are you|what('?s| is) your name|what are you called|are you (a )?(bot|ai|robot|chatbot))\b/i;

const SAM_IDENTITY_ANSWER =
  "I'm Sam, your MentorAI! I'm here to help you think through your business — pricing, strategy, funding, whatever's on your mind. What are you working on?";

export function isIdentityQuestion(message: string): boolean {
  return IDENTITY_QUESTION_RE.test(message.trim());
}

export function samIdentityAnswer(): string {
  return SAM_IDENTITY_ANSWER;
}
