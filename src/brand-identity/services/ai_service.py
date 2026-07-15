
import json
import re
import logging
from groq import AsyncGroq
from core.config import settings
from schemas.assets import (
    LogoInput, BusinessCardInput, CompanyProfileInput,
    CapabilityStatementInput, BrandGuidelinesInput,
)

logger = logging.getLogger(__name__)

TEXT_MODEL = "llama-3.3-70b-versatile"

COMPANY_PROFILE_KEYS = {
    "headline", "about", "mission_statement",
    "services", "why_us", "closing"
}

CAPABILITY_KEYS = {
    "opening", "core_competencies",
    "experience_highlights", "differentiator", "call_to_action"
}

BRAND_GUIDELINES_KEYS = {
    "brand_story", "mission_statement", "vision_statement",
    "brand_personality", "tone_of_voice", "color_usage",
    "typography", "logo_usage"
}


class AIService:

    def __init__(self):
        if not settings.GROQ_API_KEY:
            raise RuntimeError(
                "GROQ_API_KEY not set. Get your free key at https://console.groq.com"
            )
        self._client = AsyncGroq(api_key=settings.GROQ_API_KEY)
        logger.info(f"AIService initialised: model={TEXT_MODEL}")

    # ─── Internal helpers ─────────────────────────────────────────────────────

    async def _call(self, system: str, user: str, max_tokens: int = 2000) -> str:
        response = await self._client.chat.completions.create(
            model=TEXT_MODEL,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            max_tokens=max_tokens,
            temperature=0.7,
        )
        return response.choices[0].message.content.strip()

    def _extract_json(self, raw: str) -> dict:
        cleaned = re.sub(r"```(?:json)?\s*", "", raw).replace("```", "").strip()
        match = re.search(r"\{.*\}", cleaned, re.DOTALL)
        if not match:
            raise ValueError(f"No JSON found in response: {cleaned[:300]}")
        return json.loads(match.group())

    async def _call_json(
        self,
        system: str,
        user: str,
        required_keys: set,
        max_tokens: int = 2000,
        retries: int = 2,
    ) -> dict:
        for attempt in range(retries):
            try:
                raw = await self._call(system, user, max_tokens)
                result = self._extract_json(raw)
                missing = required_keys - result.keys()
                if missing:
                    raise ValueError(f"Response missing keys: {missing}")
                return result
            except (ValueError, json.JSONDecodeError) as e:
                logger.warning(f"JSON parse attempt {attempt + 1} failed: {e}")
                if attempt == retries - 1:
                    raise RuntimeError(
                        f"Groq failed to return valid JSON after {retries} attempts: {e}"
                    )
                user += (
                    "\n\nCRITICAL: Return ONLY a raw JSON object. "
                    "No markdown, no explanation, no backticks."
                )

    # ─── Logo ─────────────────────────────────────────────────────────────────

    async def generate_logo_svg(self, inputs: LogoInput) -> str:
        feel = inputs.brand_feel or "professional and modern"
        primary = inputs.primary_color or "#001F3F"
        secondary = inputs.secondary_color or "#D7263D"
        logo_style = (
            inputs.logo_style.value
            if hasattr(inputs.logo_style, "value")
            else str(inputs.logo_style)
        )
        tagline_instruction = (
            f'Below the brand name, add the tagline "{inputs.tagline}" in a smaller, '
            f'lighter font (font-size around 14-16px) in {secondary}.'
            if inputs.tagline else
            "Do not add a tagline."
        )

        style_guidance = {
            "Wordmark": (
                "Create a pure typographic logo — the brand name IS the logo. "
                "Use creative letter spacing, weight contrast, or a single distinctive "
                "geometric element integrated into one letter. "
                "Make the text large and impactful (font-size 52-64px). "
                "Optionally add a thin horizontal rule or geometric underline accent."
            ),
            "Lettermark": (
                "Use only the initials of the brand name. Make them very large (font-size 80-100px), "
                "bold, and geometrically interesting. Add a background shape (circle, rounded square, "
                "hexagon) behind or around the letters using the primary color. "
                "The letters should contrast clearly against the shape."
            ),
            "Emblem": (
                "Enclose the brand name inside or beneath a strong geometric shape — shield, circle, "
                "badge, hexagon, or crest. The shape should use the primary color filled or stroked. "
                "Brand name sits inside or below the emblem shape. "
                "Add a thin inner border or double-stroke for depth."
            ),
            "Combination Mark": (
                "Place a custom icon/symbol to the LEFT of the brand name text. "
                "The icon should be a simple geometric shape (2-4 SVG paths/shapes) that relates "
                "to the industry. Icon uses primary color, brand name text sits to its right. "
                "Vertically center the icon with the text. Icon width ~60-70px."
            ),
        }.get(logo_style, "Create a clean professional logo.")

        system = """You are a world-class SVG logo designer with 20 years of experience creating logos for Fortune 500 companies. You have deep expertise in typography, color theory, and geometric design.

CRITICAL RULES:
- Return ONLY raw SVG code. Zero prose, zero markdown, zero backticks.
- Every SVG must be production-ready and look like it was designed by a professional studio.
- Use only SVG primitives: rect, circle, ellipse, polygon, path, text, line, polyline, g.
- All text must use web-safe fonts: font-family="Arial, Helvetica, sans-serif" or font-family="Georgia, serif".
- No external resources, no images, no clipPath unless essential, no filters.
- The logo must be immediately recognizable and work at any size."""

        user = f"""Design a professional {logo_style} logo for this brand:

━━━ BRAND BRIEF ━━━
Brand Name: {inputs.brand_name}
Industry: {inputs.industry}
Brand Feel: {feel}
Primary Color: {primary} (dominant — use for main elements, backgrounds, shapes)
Accent Color: {secondary} (use sparingly — highlights, dots, underlines, icons)

━━━ CANVAS ━━━
viewBox="0 0 400 200" width="400" height="200"
Background: white rectangle <rect width="400" height="200" fill="#FFFFFF"/>
Padding: minimum 20px from all edges
Composition: perfectly centered horizontally and vertically

━━━ STYLE DIRECTION ━━━
{style_guidance}

━━━ TAGLINE ━━━
{tagline_instruction}

━━━ QUALITY CHECKLIST ━━━
✓ Background white rect is the FIRST element inside <svg>
✓ Brand name is clearly legible at full size
✓ Primary color {primary} is used for main visual weight
✓ Accent color {secondary} appears in 1-2 places maximum
✓ No gradients, no drop-shadows, no blur filters
✓ All shapes and text are within the viewBox bounds
✓ The design looks like a real company logo, not clip art

Return the complete SVG element only."""

        logger.info(f"Generating logo SVG via Groq for: {inputs.brand_name}")
        for attempt in range(3):
            try:
                raw = await self._call(system, user, max_tokens=3000)
                svg = raw.strip()
                if "```" in svg:
                    svg = re.sub(r"```(?:svg|xml)?\s*", "", svg).replace("```", "").strip()
                match = re.search(r"(<svg[\s\S]*?</svg>)", svg, re.IGNORECASE)
                if match:
                    svg = match.group(1)
                if not svg.startswith("<svg"):
                    raise ValueError("Response does not contain valid SVG")
                logger.info(f"Logo SVG generated ({len(svg)} chars)")
                return svg
            except Exception as e:
                logger.warning(f"Logo SVG attempt {attempt + 1} failed: {e}")
                if attempt == 2:
                    raise RuntimeError(f"Failed to generate logo SVG after 3 attempts: {e}")

    # ─── Business Card Style ──────────────────────────────────────────────────

    async def generate_business_card_style(self, inputs: BusinessCardInput) -> dict:
        system = """You are a senior brand designer and print specialist with expertise in business card design.
You understand visual hierarchy, whitespace, typography pairing, and how color creates brand impact on small formats.
Return ONLY a JSON object. No markdown, no explanation, no backticks."""

        user = f"""Analyse this brand and design the optimal business card layout strategy.

━━━ BRAND INPUT ━━━
Company: {inputs.company_name}
Person: {inputs.full_name}
Role: {inputs.job_title}
Primary Color: {inputs.primary_color or "#001F3F"}
Secondary Color: {inputs.secondary_color or "#D7263D"}

━━━ DESIGN CONTEXT ━━━
Standard card size: 3.5 x 2 inches (1050 x 600px at 300dpi)
Front must communicate: name, role, company, contact details
Back must communicate: brand identity and company name

Provide a detailed design strategy:

Return JSON:
{{
  "layout": "detailed layout — e.g. full dark primary background front, name in white 58px bold top-left, role in accent color below, contact icons bottom-left, back has split panel left primary right white",
  "font_weight": "bold | regular | light",
  "style_mood": "minimal | corporate | creative | bold",
  "accent_placement": "top strip | left border | bottom strip | corner | split panel",
  "front_bg": "hex — front card background",
  "back_bg": "hex — back card background",
  "name_color": "hex — person name text color",
  "title_color": "hex — job title text color",
  "contact_color": "hex — contact details text color",
  "back_text_color": "hex — company name on back",
  "design_notes": "2-3 sentences of specific design guidance for this brand"
}}"""

        return await self._call_json(
            system, user,
            required_keys={"layout", "font_weight", "style_mood", "accent_placement"},
            max_tokens=800,
        )

    # ─── Company Profile ──────────────────────────────────────────────────────

    async def generate_company_profile(self, inputs: CompanyProfileInput) -> dict:
        system = """You are an award-winning business writer and brand strategist who has written company profiles for startups, SMEs, and multinationals across every industry.

Your writing is:
- Compelling and human — never robotic or stuffed with corporate jargon
- Specific — you use concrete details, not vague claims
- Confident — the company sounds credible, capable, and trustworthy
- Audience-aware — written for potential clients and partners, not investors

Return ONLY a raw JSON object. No markdown, no explanation, no backticks."""

        user = f"""Write a world-class company profile for the following business.
Study every detail provided and make the writing feel custom-built for this specific company.

━━━ COMPANY DETAILS ━━━
Company Name: {inputs.company_name}
Industry: {inputs.industry}
What they do: {inputs.description}
Mission: {inputs.mission_statement or "Not provided — craft one that fits perfectly"}
Key Services / Products: {inputs.key_services}
Year Founded: {inputs.year_founded or "Not specified"}
Location: {inputs.location}

━━━ WRITING BRIEF ━━━
- Headline: One magnetic opening line that makes the reader want to know more (max 15 words)
- About: 3-4 rich paragraphs. Open with context/problem, introduce the company as the solution, describe how they work and what makes them distinctive, close with their impact or trajectory
- Mission: A refined, memorable single sentence — ambitious but grounded
- Services: Each service listed with its name and a punchy one-line value proposition
- Why Us: 2 paragraphs making the case for choosing this company — be specific, avoid generic claims like "we are passionate"
- Closing: One powerful closing line that plants a seed and invites the next step

━━━ TONE ━━━
Professional, warm, confident. Short sentences where they pack a punch. No buzzwords (no "synergy", "leverage", "holistic", "cutting-edge"). Write like a human who believes in this company.

Return JSON:
{{
  "headline": "single magnetic line",
  "about": "3-4 paragraphs as one string with \\n\\n between paragraphs",
  "mission_statement": "refined single-sentence mission",
  "services": ["Service Name: punchy one-line value proposition"],
  "why_us": "2 paragraphs as one string with \\n\\n between",
  "closing": "one strong closing line with subtle call to action"
}}"""

        return await self._call_json(
            system, user,
            required_keys=COMPANY_PROFILE_KEYS,
            max_tokens=2500,
        )

    # ─── Capability Statement ─────────────────────────────────────────────────

    async def generate_capability_statement(self, inputs: CapabilityStatementInput) -> dict:
        system = """You are a specialist bid writer and B2B copywriter with a track record of winning government contracts, corporate tenders, and enterprise deals.

Your capability statements are:
- Direct and confident — no hedging, no fluff
- Results-oriented — you lead with outcomes and proof, not process
- Skimmable — structured so a busy procurement officer gets the point in 30 seconds
- Credible — specific enough to be believable, not so specific it becomes a liability

Return ONLY a raw JSON object. No markdown, no explanation, no backticks."""

        user = f"""Write a high-impact capability statement for this company.
This document will be submitted to potential clients, procurement teams, and partners.
Make every word count.

━━━ COMPANY INPUT ━━━
Company: {inputs.company_name}
Core Competencies: {inputs.core_competencies}
Past Clients / Experience: {inputs.past_clients or "Not provided — infer credible experience from industry context"}
What makes them different: {inputs.differentiator}
Contact: {inputs.contact_info}

━━━ WRITING BRIEF ━━━
- Opening: A bold, specific headline that immediately communicates what this company does and for whom (max 12 words). Think: "We help [target] achieve [outcome] through [method]."
- Core Competencies: List each competency with a concrete proof point or measurable outcome — not just a label. E.g. "Project Management: Delivered 40+ infrastructure projects on time and within budget since 2018."
- Experience Highlights: 2 strong paragraphs on track record. Name industries served, scale of work, notable achievements. If no clients provided, speak to depth of experience and types of challenges solved.
- Differentiator: 1 powerful paragraph — what this company does that competitors don't or can't. Be specific. Avoid generic claims.
- Call to Action: A natural, confident closing line that includes contact info and makes the next step obvious.

━━━ TONE ━━━
Direct, professional, assertive. No passive voice. Present tense where possible. Written for decision-makers who read hundreds of these documents.

Return JSON:
{{
  "opening": "bold specific headline max 12 words",
  "core_competencies": ["Competency Name: concrete proof point or measurable outcome"],
  "experience_highlights": "2 paragraphs with \\n\\n between",
  "differentiator": "1 powerful paragraph",
  "call_to_action": "natural confident closing with contact info"
}}"""

        return await self._call_json(
            system, user,
            required_keys=CAPABILITY_KEYS,
            max_tokens=2000,
        )

    # ─── Brand Guidelines ─────────────────────────────────────────────────────

    async def generate_brand_guidelines(self, inputs: BrandGuidelinesInput) -> dict:
        system = """You are a creative director and brand strategist who has built brand systems for startups, scale-ups, and global companies.

Your brand guidelines are:
- Strategic, not just aesthetic — every decision has a reason
- Actionable — teams can pick this up and immediately know what to do
- Consistent — all elements feel like they belong to the same world
- Specific — you name actual fonts, exact use cases, real examples

Return ONLY a raw JSON object. No markdown, no explanation, no backticks."""

        user = f"""Build a comprehensive, professional brand guideline document for this brand.
Every section should feel tailored to this specific company — not generic.

━━━ BRAND INPUT ━━━
Brand Name: {inputs.brand_name}
Industry: {inputs.industry}
Mission: {inputs.brand_mission}
Target Audience: {inputs.target_audience}
Brand Personality: {inputs.brand_personality}
Primary Color: {inputs.primary_color or "Not specified — choose the ideal color for this brand"}
Secondary Color: {inputs.secondary_color or "Not specified — recommend a complementary color"}
Preferred Fonts: {inputs.preferred_fonts or "Not specified — recommend the ideal font pairing"}

━━━ SECTION BRIEFS ━━━

BRAND STORY: 2 rich paragraphs — the origin, the problem this brand was built to solve, and the vision driving it forward. Make it emotional and specific.

MISSION: A single refined sentence. Ambitious but achievable. Clear subject, clear action, clear beneficiary.

VISION: Where this brand will be in 5 years. Aspirational but credible. One sentence.

BRAND PERSONALITY: 4-5 traits that define how this brand thinks, feels, and acts. Each trait needs a practical description — not just a word, but what it means in real brand decisions.

TONE OF VOICE: How the brand speaks. 2 sentences of description, then 3 specific DOs (with examples) and 3 specific DON'Ts (with examples). Be concrete enough that a copywriter could use these immediately.

COLOR USAGE: For each color — its name, its hex, when and where to use it, and any usage rules (e.g. never use primary on secondary background).

TYPOGRAPHY: Recommend specific named fonts (Google Fonts preferred). Explain WHY each font was chosen for this brand. Give concrete sizing/weight guidance for headings, subheadings, body, captions.

LOGO USAGE: 3 clear DOs and 3 clear DON'Ts. Be specific — not "don't distort the logo" but describe real misuse scenarios relevant to this brand.

Return JSON:
{{
  "brand_story": "2 paragraphs with \\n\\n between",
  "mission_statement": "single refined sentence",
  "vision_statement": "single aspirational sentence",
  "brand_personality": [
    {{"trait": "Trait Name", "description": "what this means in practice for this brand"}}
  ],
  "tone_of_voice": {{
    "description": "2 sentences on how this brand speaks",
    "do": ["Do: specific guideline with example", "Do: ...", "Do: ..."],
    "dont": ["Don't: specific guideline with example", "Don't: ...", "Don't: ..."]
  }},
  "color_usage": {{
    "primary": {{"hex": "{inputs.primary_color or '#001F3F'}", "name": "color name", "usage": "specific when and where with rules"}},
    "secondary": {{"hex": "{inputs.secondary_color or '#D7263D'}", "name": "color name", "usage": "specific when and where with rules"}}
  }},
  "typography": {{
    "heading_font": "Font Name — why this font fits this brand",
    "body_font": "Font Name — why this font fits this brand",
    "usage_rules": "Specific sizing, weight, line-height, pairing guidance"
  }},
  "logo_usage": {{
    "dos": ["specific rule 1", "specific rule 2", "specific rule 3"],
    "donts": ["specific never-do 1", "specific never-do 2", "specific never-do 3"]
  }}
}}"""

        return await self._call_json(
            system, user,
            required_keys=BRAND_GUIDELINES_KEYS,
            max_tokens=4000,
        )

    # ─── Palette Suggestion ───────────────────────────────────────────────────

    async def suggest_palette(self, primary_color: str, sector: str) -> dict:
        system = """You are a colour theorist and brand designer with deep expertise in how colour communicates across industries, cultures, and contexts.
You understand contrast ratios, accessibility (WCAG), colour psychology, and how palettes work in both digital and print environments.
Return ONLY a raw JSON object. No markdown, no backticks."""

        user = f"""Build a complete, professional brand colour palette for this brief.

━━━ INPUT ━━━
Primary Color: {primary_color}
Industry: {sector}

━━━ PALETTE REQUIREMENTS ━━━
- Secondary: Should complement the primary — harmonious but distinct. Consider analogous, complementary, or split-complementary relationships.
- Accent: A punchy highlight colour for CTAs, buttons, highlights. Should contrast well with both primary and secondary.
- Neutral Dark: For body text, headings on light backgrounds. Near-black but with a hint of the brand hue — not pure #000000.
- Neutral Light: For page backgrounds, card backgrounds. Off-white with warmth or coolness matching the brand mood — not pure #FFFFFF.
- Rationale: Explain the colour theory logic behind these choices and why they suit this specific industry.

━━━ QUALITY RULES ━━━
- All hex codes must be valid 6-digit hex values
- Accent must have at least 4.5:1 contrast ratio against white or the neutral light
- Neutral dark must have at least 7:1 contrast against neutral light (AAA accessibility)
- No two colors should be too similar to each other

Return JSON:
{{
  "secondary": "#hexcode",
  "accent": "#hexcode",
  "neutral_dark": "#hexcode",
  "neutral_light": "#hexcode",
  "rationale": "2-3 sentences explaining the colour theory logic and industry fit"
}}"""

        return await self._call_json(
            system, user,
            required_keys={"secondary", "accent", "neutral_dark", "neutral_light", "rationale"},
            max_tokens=600,
        )


# Singleton
ai_service = AIService()