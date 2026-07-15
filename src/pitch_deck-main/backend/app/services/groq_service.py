
import json
import logging
from groq import Groq
from app.config import settings

logger = logging.getLogger(__name__)

client = Groq(api_key=settings.GROQ_API_KEY)
MODEL = "llama-3.3-70b-versatile"

SLIDES_SCHEMA = """
{
  "company_name": "string",
  "tagline": "string",
  "slides": [
    {
      "slide_number": 1,
      "title": "Cover",
      "heading": "string — company name or bold mission statement",
      "subheading": "string — one-line value proposition",
      "bullets": []
    },
    {
      "slide_number": 2,
      "title": "Problem",
      "heading": "string — the core pain point",
      "subheading": "string — who suffers from this and how badly",
      "bullets": [
        "string — specific stat or data point about the problem scale",
        "string — current broken solution people use today",
        "string — cost of the problem (time, money, frustration)"
      ]
    },
    {
      "slide_number": 3,
      "title": "Solution",
      "heading": "string — what you built",
      "subheading": "string — one sentence on how it works",
      "bullets": [
        "string — core feature 1 and its direct benefit",
        "string — core feature 2 and its direct benefit",
        "string — core feature 3 and its direct benefit",
        "string — key differentiator vs existing options"
      ]
    },
    {
      "slide_number": 4,
      "title": "How It Works",
      "heading": "string",
      "subheading": "string — simple product walkthrough intro",
      "bullets": [
        "Step 1: string — user action",
        "Step 2: string — what happens",
        "Step 3: string — outcome for user",
        "string — key technical advantage or unique mechanism"
      ]
    },
    {
      "slide_number": 5,
      "title": "Market Size",
      "heading": "string — bold market opportunity statement",
      "subheading": "string — market context",
      "bullets": [
        "TAM: $XB — string description of total addressable market",
        "SAM: $XB — string description of serviceable addressable market",
        "SOM: $XM — string description of your realistic capture in 3-5 years",
        "string — market growth rate CAGR or key trend driving growth"
      ]
    },
    {
      "slide_number": 6,
      "title": "Business Model",
      "heading": "string — how you make money",
      "subheading": "string — revenue model summary",
      "bullets": [
        "string — primary revenue stream with pricing (e.g. $X/month SaaS)",
        "string — secondary revenue stream",
        "string — unit economics (CAC, LTV, or gross margin)",
        "string — path to profitability or key financial milestone"
      ]
    },
    {
      "slide_number": 7,
      "title": "Traction",
      "heading": "string — proof this is working",
      "subheading": "string — stage and momentum summary",
      "bullets": [
        "string — users/revenue/contracts with specific numbers",
        "string — month-over-month growth rate",
        "string — key partnership, pilot, or validation",
        "string — notable milestone achieved"
      ]
    },
    {
      "slide_number": 8,
      "title": "Competition",
      "heading": "string — your competitive position",
      "subheading": "string — why the market is underserved today",
      "bullets": [
        "string — Competitor A: what they do and their key weakness",
        "string — Competitor B: what they do and their key weakness",
        "string — your unique advantage that none of them have",
        "string — your defensible moat (data, network, IP, distribution)"
      ]
    },
    {
      "slide_number": 9,
      "title": "Team",
      "heading": "string — why this team will win",
      "subheading": "string — collective experience summary",
      "bullets": [
        "string — Founder/CEO: name, relevant background, key achievement",
        "string — CTO/Co-founder: name, technical background, key achievement",
        "string — Key hire or advisor: name, why they matter",
        "string — team's unfair advantage or domain expertise"
      ]
    },
    {
      "slide_number": 10,
      "title": "The Ask",
      "heading": "string — funding round headline",
      "subheading": "string — what this round unlocks",
      "bullets": [
        "Raising: $XM [Seed/Series A] at $XM valuation",
        "Use of funds: X% product, X% sales, X% ops",
        "string — 18-month milestone this funding achieves",
        "string — projected ARR or user growth by end of runway"
      ]
    },
    {
      "slide_number": 11,
      "title": "Summary",
      "heading": "string — compelling single-line thesis",
      "subheading": "string — why now is the right time",
      "bullets": [
        "string — problem recap in one punchy line",
        "string — solution recap and key differentiator",
        "string — market size and opportunity",
        "string — traction proof point",
        "string — what you are asking for and what it achieves"
      ]
    },
    {
      "slide_number": 12,
      "title": "Thank You",
      "heading": "string — closing statement or call to action",
      "subheading": "string — contact info or next step",
      "bullets": []
    }
  ]
}
"""

SYSTEM_PROMPT = f"""You are an expert startup pitch deck writer used by top accelerators.
Your job is to generate compelling, investor-ready pitch deck content that tells a clear story.
You MUST respond with ONLY valid JSON — no preamble, no explanation, no markdown fences.
Follow this exact schema:
{SLIDES_SCHEMA}

Rules:
- Every slide must have a heading and subheading
- Bullets must be specific, data-driven, and punchy — no vague filler
- Market size MUST include realistic dollar figures (TAM/SAM/SOM)
- Business Model MUST include real pricing and unit economics estimates
- Traction MUST include specific numbers even if projected/estimated for early stage
- Team bullets MUST include names and specific credentials
- The Ask MUST include a specific dollar amount and use-of-funds breakdown
- Summary must tie the whole story together in 5 bullet points
- Thank You slide bullets should be empty []
- company_name and tagline must be compelling and memorable
- Generate exactly 12 slides
"""


def _build_quick_prompt(data: dict) -> str:
    return f"""Generate a full 12-slide investor pitch deck for this business idea:

Title: {data.get('title')}
Idea: {data.get('idea')}

Infer all details intelligently — problem, solution, market size with real numbers,
business model with pricing, realistic traction for the stage, team structure,
and a specific funding ask. Make it compelling and investor-ready."""


def _build_structured_prompt(data: dict) -> str:
    traction = data.get("traction") or "Pre-traction / early stage — use realistic projections"
    return f"""Generate a full 12-slide investor pitch deck using this information:

Title: {data.get('title')}
Problem: {data.get('problem')}
Solution: {data.get('solution')}
Market: {data.get('market')}
Business Model: {data.get('business_model')}
Traction: {traction}
Team: {data.get('team')}
The Ask: {data.get('ask')}

Use the provided details directly. Enrich with specific numbers and investor-ready language.
Fill any gaps intelligently."""


def _build_raw_prompt(data: dict) -> str:
    return f"""Extract and structure the following raw notes into a full 12-slide investor pitch deck:

Title: {data.get('title')}
Raw Notes:
{data.get('notes')}

Identify all key elements from the notes and enrich with specific numbers,
realistic market sizing, and investor-ready language. Fill missing details intelligently."""


PROMPT_BUILDERS = {
    "quick": _build_quick_prompt,
    "structured": _build_structured_prompt,
    "raw": _build_raw_prompt,
}


def generate_slides(input_type: str, data: dict) -> dict:
    builder = PROMPT_BUILDERS.get(input_type)
    if not builder:
        raise ValueError(f"Unknown input_type: {input_type}")

    user_prompt = builder(data)
    logger.info(f"Calling Groq for input_type={input_type}, title={data.get('title')}")

    response = client.chat.completions.create(
        model=MODEL,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt},
        ],
        temperature=0.7,
        max_tokens=6000,
    )

    raw_content = response.choices[0].message.content.strip()

    if raw_content.startswith("```"):
        raw_content = raw_content.split("```")[1]
        if raw_content.startswith("json"):
            raw_content = raw_content[4:]
        raw_content = raw_content.strip()

    try:
        slides_data = json.loads(raw_content)
    except json.JSONDecodeError as e:
        logger.error(f"Groq returned invalid JSON: {e}\nRaw: {raw_content[:500]}")
        raise ValueError(f"AI returned invalid JSON: {e}")

    _validate_slides(slides_data)
    logger.info(f"Slides generated successfully: {len(slides_data.get('slides', []))} slides")
    return slides_data


def _validate_slides(data: dict) -> None:
    if "slides" not in data:
        raise ValueError("Missing 'slides' key in AI response")
    if "company_name" not in data:
        raise ValueError("Missing 'company_name' in AI response")
    if len(data["slides"]) != 12:
        raise ValueError(f"Expected 12 slides, got {len(data['slides'])}")
    for slide in data["slides"]:
        for field in ("slide_number", "title", "heading", "subheading", "bullets"):
            if field not in slide:
                raise ValueError(f"Slide missing field '{field}': {slide}")
