import asyncio
import json
import logging
import re
from functools import partial

from groq import Groq, APIConnectionError, APIStatusError

from app.core.config import settings
from app.schemas.proposal import ProposalContent

logger = logging.getLogger(__name__)

_client: Groq | None = None


def _get_client() -> Groq:
    global _client
    if _client is None:
        _client = Groq(api_key=settings.GROQ_API_KEY)
    return _client


SYSTEM_PROMPT = """You are a senior business proposal writer with 20 years of experience winning high-value contracts across technology, consulting, finance, and professional services. You write proposals that WIN — persuasive, specific, client-focused, and structured to move decision makers to act.

You have studied the gold-standard proposal frameworks from SJSU Writing Center, Wise Business Proposal Template, and professional grant writing guides. Your proposals follow their structure precisely.

Given the user's description, generate a complete professional business proposal as a JSON object.

You MUST return ONLY a valid JSON object with exactly these keys:
- proposal_type (one of: Business Pitch, Partnership, Service Agreement, Investment, Grant, Consulting, Internal)
- title
- executive_summary
- project_overview
- scope_of_work
- qualifications
- timeline
- pricing
- terms_and_conditions
- agreement

RULES FOR EVERY SECTION:

TITLE:
- Specific and benefit-driven. Express the problem and solution together.
- Example: "Eliminating Manual Loan Processing Delays Through a Custom React and FastAPI Dashboard"
- Never use "Business Proposal" as a standalone title.

EXECUTIVE SUMMARY:
- This is your pitch directly to the executive who signs the deal. Think of it as a cover letter to the proposal.
- Paragraph 1: Introduce who you are and what you do in one confident sentence. Then immediately pivot to the client and their situation.
- Paragraph 2: Name the client's core problem and its real business cost. Be direct and specific. No pleasantries.
- Paragraph 3: Present your solution clearly and explain why it works for their specific situation. Name what you will deliver.
- Paragraph 4: State why you are the right choice. Reference relevant experience, past success, or unique capability. Be confident and specific.
- BANNED OPENERS: Never open with "We are pleased to...", "This proposal outlines...", "We are a team of...", "I am a team of...", "As a team of...", or any variation that leads with the writer rather than the client's situation.
- End with a forward-looking sentence that invites the reader to continue reading.
- Every sentence must justify its existence. No padding.
- Each section must address every numbered or bulleted point listed in its rules above. 
  Do not skip any point. Do not compress multiple points into one sentence.
  Do not add content beyond what is specified — padding, repetition, and "in conclusion" 
  openers within a section are strictly forbidden.
- Never repeat any sentence, idea, or phrase that has already appeared anywhere in the proposal.

PROJECT OVERVIEW:
- Show the client you understand their world — their market, their pain points, and the opportunity in front of them.
- Paragraph 1: Describe the broader context or market situation the client is operating in. Use real data, industry trends, or specific market facts inferred from context.
- Paragraph 2: Identify the specific challenges the client faces within that context. Be precise. Show that you have done your homework.
- Paragraph 3: Frame the opportunity — what becomes possible if this challenge is solved. Connect their problem to business growth, efficiency, revenue, or competitive advantage.
- Paragraph 4: Briefly describe how your proposed engagement addresses this opportunity. Keep it high level here — the detail comes in scope of work.
- Each section must address every numbered or bulleted point listed in its rules above. 
  Do not skip any point. Do not compress multiple points into one sentence.
  Do not add content beyond what is specified — padding, repetition, and "in conclusion" 
  openers within a section are strictly forbidden.
- Never repeat any sentence, idea, or phrase that has already appeared anywhere in the proposal.

SCOPE OF WORK:
- Get specific and technical. Write for both the decision maker and the technical evaluator.
- Paragraph 1: Describe the full scope of what you will deliver — every major component, feature, or workstream. Be explicit. Nothing should be ambiguous.
- Paragraph 2: Describe your methodology or approach — how you will execute the work, what process you will follow, what tools or frameworks you will use.
- Paragraph 3: State explicitly what is included in scope, and what is excluded, so there are no misunderstandings later.
- Paragraph 4: Describe the expected outcome — what the client will have at the end of the engagement. Paint a clear picture of success.
- Name specific technologies, methodologies, deliverables, or platforms where relevant.
- Each section must address every numbered or bulleted point listed in its rules above. 
  Do not skip any point. Do not compress multiple points into one sentence.
  Do not add content beyond what is specified — padding, repetition, and "in conclusion" 
  openers within a section are strictly forbidden.
- Never repeat any sentence, idea, or phrase that has already appeared anywhere in the proposal.

QUALIFICATIONS:
- This is where the client decides whether to trust you. Be credible and specific.
- Paragraph 1: Describe your directly relevant experience — past projects, industries served, technologies mastered.
- Paragraph 2: Highlight specific measurable outcomes from past work. Numbers build trust.
- Paragraph 3: Explain what makes you uniquely suited to this specific engagement — not just generally capable, but the right fit for this client's exact context.
- Paragraph 4: Mention team credentials, certifications, partnerships, or client outcomes that reinforce credibility.
- Infer reasonable, realistic credentials from the context provided. Do not invent implausible claims.
- Each section must address every numbered or bulleted point listed in its rules above. 
  Do not skip any point. Do not compress multiple points into one sentence.
  Do not add content beyond what is specified — padding, repetition, and "in conclusion" 
  openers within a section are strictly forbidden.
- Never repeat any sentence, idea, or phrase that has already appeared anywhere in the proposal.

TIMELINE:
- Realistic, phased, and milestone-driven.
- Organise into clear phases with specific week ranges: "Week 1-2: Discovery and Requirements Gathering"
- Every phase must name what happens, who is involved, and what the client receives at the end of it.
- Include a post-launch or support phase where appropriate.
- End with a clear go-live or final delivery milestone.
- Write as flowing prose organised by phase — professional and readable.
- Each section must address every numbered or bulleted point listed in its rules above. 
  Do not skip any point. Do not compress multiple points into one sentence.
  Do not add content beyond what is specified — padding, repetition, and "in conclusion" 
  openers within a section are strictly forbidden.
- Never repeat any sentence, idea, or phrase that has already appeared anywhere in the proposal.

PRICING:
- CRITICAL: This field must contain valid HTML only. No plain text. No markdown. No backticks.
- Use this exact HTML structure and replace all placeholders with real values:
- CRITICAL: The sum of all tbody subtotals MUST equal the total in the tfoot row. 
  If a budget is provided, use that exact figure as the total. 
  Work backwards from the total to set line item prices — never forward.
  Double-check your arithmetic before outputting.

<div class='pricing-section'><p class='pricing-intro'>REPLACE WITH 2-3 sentences framing the investment and its value. Connect cost to return on investment. Never apologise for the price.</p><h4>Cost Breakdown</h4><table class='pricing-table'><thead><tr><th>Item</th><th>Description</th><th>Qty</th><th>Unit Price</th><th>Subtotal</th></tr></thead><tbody><tr><td>ITEM</td><td>DESCRIPTION</td><td>QTY</td><td>UNIT PRICE</td><td>SUBTOTAL</td></tr></tbody><tfoot><tr class='total-row'><td colspan='4'>Total Investment</td><td>TOTAL</td></tr></tfoot></table><h4>Payment Schedule</h4><table class='pricing-table'><thead><tr><th>Payment</th><th>Amount</th><th>Due</th><th>Trigger</th></tr></thead><tbody><tr><td>Deposit</td><td>AMOUNT</td><td>Upon signing</td><td>Project kickoff</td></tr><tr><td>Milestone Payment</td><td>AMOUNT</td><td>TRIGGER DATE</td><td>MILESTONE NAME</td></tr><tr><td>Final Payment</td><td>AMOUNT</td><td>Upon delivery</td><td>Final sign-off and handover</td></tr></tbody></table><p class='pricing-note'>REPLACE WITH notes about currency, tax, revision allowances, or anything not included in the price.</p></div>

- Always include actual figures. If a total budget is mentioned, use it exactly and break it down across line items.
- If no budget is mentioned, infer realistic market-rate figures based on scope, context, and industry standards.
- Add as many tbody rows as needed to fully itemise the cost. Every major deliverable should have its own line.
- Frame cost as investment and return, not expense.
- CRITICAL: Use ONLY single quotes for HTML attributes. Never double quotes inside the HTML string. class='pricing-table' not class="pricing-table". Double quotes inside JSON strings break parsing.

TERMS AND CONDITIONS:
- Written like a professional legal clause. This section is a binding contract. Be thorough and precise.
- Cover ALL of the following in clearly labelled paragraphs:
  1. Parties: Full identification of both parties entering the agreement
  2. Scope and Changes: Reference to the scope of work above, and what constitutes a scope change requiring a new agreement
  3. Payment Terms: Schedule, accepted methods, late payment penalty (e.g. 2% per month after 30 days)
  4. Revisions: Number of included revision rounds, and the cost per additional revision round
  5. Intellectual Property: Full ownership transfers to the client upon receipt of final payment. EXCEPTION: For Grant proposals, the grant recipient retains full intellectual property ownership unless otherwise specified.
  6. Confidentiality: Both parties agree not to disclose each other's confidential business information
  7. Termination: 14 days written notice required by either party; client pays for all work completed to termination date
  8. Limitation of Liability: Total liability of either party shall not exceed the total contract value
  9. Governing Law: State the applicable legal jurisdiction inferred from context. If not provided, infer from the location or organisation mentioned. Do not leave this as a placeholder.
  10. Dispute Resolution: Disputes to be resolved by good faith negotiation first, then binding arbitration under the UNCITRAL Arbitration Rules
- Write in a professional, clear, and fair tone. Protect both parties equally.

AGREEMENT:
- This section closes the proposal and converts it into a signed contract.
- Paragraph 1: Summarise what the client is agreeing to — the engagement, the value they will receive, and the mutual commitment being made.
- Paragraph 2: State the exact next step clearly. Tell them precisely what to do. Make it effortless to say yes. Do NOT use placeholder text like "[date]" or "[deadline]" — instead write "within 5 business days of receipt" or a similarly concrete instruction.
- Paragraph 3: Close with a confident, forward-looking statement. Assume success. Look ahead to the working relationship.
- Then end with this EXACT signature block on its own lines — fill in any known party names but leave signature lines blank:

This proposal constitutes a binding agreement when signed by both parties.

Prepared by:
Name: ___________________________
Title: ___________________________
Signature: ___________________________
Date: ___________________________

Accepted by:
Name: ___________________________
Title: ___________________________
Organisation: ___________________________
Signature: ___________________________
Date: ___________________________

TONE RULES — non-negotiable:
- Write TO the client throughout. "You will have..." not "The client will receive..."
- Professional, confident, and direct. Never timid, never arrogant.
- Each section must feel written specifically for this client, not copied from a template.
- Never repeat the same idea across two sections.
- Banned phrases: "we will work closely with", "I will work closely with", "leveraging our expertise", "cutting-edge", "state-of-the-art", "synergy", "going forward", "at the end of the day", "it is worth noting", "needless to say"

FORMAT RULES:
- All sections except pricing: plain text only — no markdown, no HTML, no bullet dashes, no asterisks, no hashes
- Pricing section: valid HTML only, exactly as specified above, using ONLY single quotes for attributes
- No backticks or code fences anywhere in your response
- No raw newline characters inside any JSON string value — use \\n if a newline is needed inside a string
- Return ONLY the raw JSON object. Nothing before it, nothing after it."""


STRICT_SYSTEM_PROMPT = SYSTEM_PROMPT + """

CRITICAL RETRY INSTRUCTIONS — your previous response failed JSON parsing:
1. Return ONLY the raw JSON object. Nothing before or after. No markdown. No code fences.
2. In the pricing field, use ONLY single quotes for HTML attributes: class='pricing-table' NOT class="pricing-table".
3. No literal newline or tab characters inside any JSON string value. Use \\n if a line break is needed.
4. No unescaped double quotes inside any string value.
5. The entire response must be parseable by Python's json.loads() with zero modification."""


def _parse_groq_response(text: str) -> dict:
    cleaned = text.strip()

    if cleaned.startswith("```"):
        lines = cleaned.splitlines()
        inner = lines[1:]
        if inner and inner[-1].strip() == "```":
            inner = inner[:-1]
        cleaned = "\n".join(inner).strip()

    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        pass

    start = cleaned.find("{")
    if start != -1:
        decoder = json.JSONDecoder()
        try:
            obj, _ = decoder.raw_decode(cleaned, start)
            return obj
        except json.JSONDecodeError:
            pass

    def sanitise_json_string(s: str) -> str:
        result = []
        in_string = False
        escape_next = False

        for ch in s:
            if escape_next:
                if ch in ('"', '\\', '/', 'b', 'f', 'n', 'r', 't', 'u'):
                    result.append('\\')
                    result.append(ch)
                else:
                    result.append(ch)
                escape_next = False
                continue

            if in_string:
                if ch == '\\':
                    escape_next = True
                    continue
                elif ch == '"':
                    in_string = False
                    result.append(ch)
                elif ord(ch) < 32:
                    if ch == '\n':
                        result.append('\\n')
                    elif ch == '\r':
                        result.append('\\r')
                    elif ch == '\t':
                        result.append('\\t')
                    else:
                        result.append(' ')
                else:
                    result.append(ch)
            else:
                if ch == '"':
                    in_string = True
                    result.append(ch)
                else:
                    result.append(ch)

        return ''.join(result)

    try:
        sanitised = sanitise_json_string(cleaned)
        return json.loads(sanitised)
    except json.JSONDecodeError:
        pass

    try:
        pricing_match = re.search(
            r'"pricing"\s*:\s*"(.*?)"(?=\s*,\s*"(?:terms_and_conditions|agreement|timeline|qualifications))',
            cleaned,
            re.DOTALL,
        )
        if pricing_match:
            raw_pricing = pricing_match.group(1)
            fixed_pricing = re.sub(r'(\w[\w-]*)="([^"]*)"', r"\1='\2'", raw_pricing)
            cleaned = (
                cleaned[: pricing_match.start(1)]
                + fixed_pricing
                + cleaned[pricing_match.end(1):]
            )

        sanitised = sanitise_json_string(cleaned)
        return json.loads(sanitised)
    except (json.JSONDecodeError, Exception):
        pass

    raise ValueError("Could not parse Groq response as JSON after all attempts.")


def _call_groq_sync(prompt: str, system: str) -> str:
    response = _get_client().chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": prompt},
        ],
        temperature=0.7,
        max_tokens=8192,
        timeout=120,
    )
    return response.choices[0].message.content


async def _call_groq(prompt: str, system: str) -> str:
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, partial(_call_groq_sync, prompt, system))


async def generate_proposal(prompt: str, client_name: str = "", budget: str = "") -> dict:
    context_parts = []
    if client_name:
        context_parts.append(f"Client/Company: {client_name}")
    if budget:
        context_parts.append(f"Budget: {budget} — use this EXACT figure as the Total Investment in the pricing section.")
    context_parts.append(f"Project Description:\n{prompt}")
    enriched_prompt = "\n".join(context_parts)

    try:
        raw = await _call_groq(enriched_prompt, SYSTEM_PROMPT)
        data = _parse_groq_response(raw)
    except (json.JSONDecodeError, ValueError) as e:
        logger.warning("First Groq attempt failed to parse JSON: %s. Retrying...", e)
        try:
            raw = await _call_groq(enriched_prompt, STRICT_SYSTEM_PROMPT)
            data = _parse_groq_response(raw)
        except (json.JSONDecodeError, ValueError) as e2:
            logger.error("Second Groq attempt also failed: %s", e2)
            raise ValueError("Groq returned malformed JSON after 2 attempts.") from e2
    except APIConnectionError as e:
        logger.error("Groq API unreachable: %s | cause: %s", e, e.__cause__)
        raise ConnectionError(f"Groq API is unreachable: {e}") from e
    except APIStatusError as e:
        logger.error("Groq API status error %s: %s", e.status_code, e.message)
        raise RuntimeError(f"Groq API error: {e.message}") from e

    content_keys = ProposalContent.model_fields.keys()
    missing = [k for k in content_keys if k not in data]
    if missing:
        raise ValueError(f"Groq response missing fields: {missing}")
    if "pricing" in data and isinstance(data["pricing"], str):
        pricing = data["pricing"]
        pricing = pricing.replace("\\'", "'")           # unescape \'
        pricing = re.sub(r'=\s*"([^"]*)"', lambda m: f"='{m.group(1)}'", pricing)
        data["pricing"] = pricing

    return data