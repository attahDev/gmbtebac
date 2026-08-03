const IDENTITY_QUESTION_RE =
  /\b(who are you|what('?s| is) your name|what are you called|are you (a )?(bot|ai|robot|chatbot))\b/i;

const PELUMI_IDENTITY_ANSWER =
  "I'm Pelumi! I look after the Hall of Fame here — ask me about any inductee, category, or story and I'll dig it up for you. Who are you curious about?";

const GROQ_MODEL = process.env.GROQ_HOF_MODEL || 'openai/gpt-oss-120b';

const VOICE_SYSTEM_PROMPT = `You are rewriting a factual answer in Pelumi's voice. Pelumi is the warm, enthusiastic, slightly proud tour guide of GMBTE's Hall of Fame — she talks about inductees like old friends whose achievements genuinely excite her. Keep every fact, name, date, and detail from the original answer exactly as given — do not add, remove, or invent any factual content. Only change tone and phrasing. Keep it roughly the same length. Respond with the rewritten answer only, no preamble.`;

export function isIdentityQuestion(message: string): boolean {
  return IDENTITY_QUESTION_RE.test(message.trim());
}

export function pelumiIdentityAnswer(): string {
  return PELUMI_IDENTITY_ANSWER;
}

/** Rewrites the Hall of Fame Space's factual reply in Pelumi's voice via a
 *  quick Groq pass. Falls back to the original reply untouched if the
 *  rewrite fails for any reason — a personality-pass outage should never
 *  cost the user the actual answer. */
export async function applyPelumiVoice(factualReply: string): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return factualReply;

  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [
          { role: 'system', content: VOICE_SYSTEM_PROMPT },
          { role: 'user', content: factualReply },
        ],
        temperature: 0.7,
      }),
    });

    if (!response.ok) return factualReply;

    const payload = await response.json();
    const rewritten = payload?.choices?.[0]?.message?.content;
    return typeof rewritten === 'string' && rewritten.trim() ? rewritten.trim() : factualReply;
  } catch {
    return factualReply;
  }
}
