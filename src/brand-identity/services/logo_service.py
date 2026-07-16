import logging
import httpx
from schemas.assets import LogoInput
from core.config import settings

logger = logging.getLogger(__name__)

RECRAFT_BASE = "https://external.api.recraft.ai/v1"


def _hex_to_color_name(hex_color: str) -> str:
    """Map common brand hex values to descriptive color names for better prompt following."""
    hex_color = hex_color.upper().strip()
    mapping = {
        # Blues
        "#001F3F": "deep navy blue", "#003366": "dark navy blue",
        "#0A2342": "midnight navy",  "#1A73E8": "bright electric blue",
        "#0057B7": "royal blue",     "#4A90D9": "sky blue",
        "#00BFFF": "bright cyan blue",
        # Reds
        "#D7263D": "vivid crimson red", "#CC0000": "bold red",
        "#FF0000": "bright red",        "#8B0000": "deep dark red",
        "#E63946": "strong coral red",
        # Greens
        "#006400": "deep forest green", "#228B22": "rich green",
        "#00A86B": "emerald green",     "#2ECC71": "bright green",
        # Purples
        "#4B0082": "deep indigo",       "#6A0DAD": "rich purple",
        "#9B59B6": "medium purple",     "#7B2FBE": "vivid violet",
        # Oranges / Yellows
        "#FF5722": "vivid orange",      "#FF6B00": "bold orange",
        "#FFC107": "warm amber yellow", "#F4D03F": "golden yellow",
        # Neutrals
        "#1A1A1A": "near black",        "#333333": "dark charcoal",
        "#555555": "medium grey",       "#888888": "warm grey",
        "#FFFFFF": "white",             "#F5F5F5": "off white",
        # Blacks
        "#000000": "black",
    }
    if hex_color in mapping:
        return mapping[hex_color]
    # Fallback: classify by hue range
    try:
        r = int(hex_color[1:3], 16)
        g = int(hex_color[3:5], 16)
        b = int(hex_color[5:7], 16)
        if r > 180 and g < 80 and b < 80:
            return "deep red"
        if r < 80 and g < 80 and b > 150:
            return "deep blue"
        if r < 80 and g > 140 and b < 100:
            return "deep green"
        if r > 180 and g > 100 and b < 60:
            return "warm orange"
        if r > 180 and g > 180 and b < 80:
            return "golden yellow"
        if r > 120 and b > 120 and g < 80:
            return "rich purple"
        if r < 60 and g < 60 and b < 60:
            return "near black"
        if r > 200 and g > 200 and b > 200:
            return "light grey"
    except (ValueError, IndexError):
        pass
    return hex_color  # last resort: keep the hex


_STYLE_LEAD = {
    "Wordmark": (
        "A wordmark logo",
        "The logo is purely typographic — the brand name rendered in distinctive, "
        "carefully crafted letterforms with no separate icon or symbol."
    ),
    "Lettermark": (
        "A lettermark logo",
        "The logo uses only the brand initials, rendered as large bold geometric "
        "letterforms enclosed within a strong shape such as a circle or hexagon."
    ),
    "Emblem": (
        "An emblem logo",
        "The brand name is enclosed inside a unified shape — a shield, badge, or crest — "
        "forming a single compact mark with the text integrated into the emblem."
    ),
    "Combination Mark": (
        "A combination mark logo",
        "A simple flat icon sits to the left of the brand name in bold typography. "
        "The icon is a minimal geometric symbol that relates to the industry. "
        "Icon and text are vertically centered and in visual balance."
    ),
}

_TYPE_CLAUSE = {
    "image_based": "The mark is symbolic and iconic, leading with a graphic element.",
    "typographic": "The mark is typography-driven; lettering is the primary visual element.",
}

_FEEL_EXPANSION = {
    "professional": "refined, trustworthy, and corporate in tone",
    "modern":       "contemporary and clean with strong geometric structure",
    "minimal":      "stripped back with generous whitespace and restrained detail",
    "bold":         "strong, high-contrast, and immediately commanding",
    "elegant":      "sophisticated with fine lines and a luxury sensibility",
    "playful":      "approachable, friendly, with a light and energetic character",
    "innovative":   "forward-thinking with a tech-forward and dynamic feel",
    "traditional":  "classic, dependable, and grounded in established aesthetics",
    "creative":     "expressive and distinctive with artistic personality",
    "friendly":     "warm, inviting, and approachable",
}


def _expand_feel(feel: str) -> str:
    """Turn a brand feel string into a richer descriptive clause."""
    feel_lower = feel.lower()
    matched = [desc for keyword, desc in _FEEL_EXPANSION.items() if keyword in feel_lower]
    if matched:
        return " and ".join(matched)
    return feel


def _logo_prompt(inputs: LogoInput) -> str:
    style     = inputs.logo_style.value if hasattr(inputs.logo_style, "value") else str(inputs.logo_style)
    logo_type = inputs.logo_type.value  if hasattr(inputs.logo_type,  "value") else str(inputs.logo_type)
    feel      = inputs.brand_feel or "professional and modern"

    lead_phrase, style_description = _STYLE_LEAD.get(
        style,
        ("A professional logo", "Clean, well-balanced mark suitable for professional use.")
    )
    type_clause  = _TYPE_CLAUSE.get(logo_type, "")
    feel_clause  = _expand_feel(feel)
    primary_name = _hex_to_color_name(inputs.primary_color or "#001F3F")
    accent_name  = _hex_to_color_name(inputs.secondary_color or "#D7263D")

    # Sentence 1 — what it is and who it's for
    sentence1 = (
        f"{lead_phrase} for '{inputs.brand_name}', "
        f"a {inputs.industry} company."
    )

    # Sentence 2 — style description + logo type
    sentence2 = style_description
    if type_clause:
        sentence2 = f"{sentence2} {type_clause}"

    # Sentence 3 — color
    sentence3 = (
        f"The primary color is {primary_name}, used for the main visual weight. "
        f"The accent color is {accent_name}, used sparingly for highlights or secondary elements."
    )

    # Sentence 4 — brand feel
    sentence4 = f"The overall feel is {feel_clause}."

    # Sentence 5 — tagline (optional)
    sentence5 = (
        f"Below the mark, include the tagline '{inputs.tagline}' "
        f"in small, light typography."
        if inputs.tagline else ""
    )

    # Sentence 6 — technical constraints
    sentence6 = (
        "White background. Flat vector style. "
        "No gradients, no drop shadows, no textures, no photography. "
        "Professional, scalable, and print-ready."
    )

    parts = [sentence1, sentence2, sentence3, sentence4, sentence6]
    if sentence5:
        parts.insert(4, sentence5)  # insert before technical constraints

    return " ".join(parts)


class LogoService:

    async def _recraft_generate(self, prompt: str) -> bytes:
        async with httpx.AsyncClient(timeout=90) as client:
            resp = await client.post(
                f"{RECRAFT_BASE}/images/generations",
                headers={
                    "Authorization": f"Bearer {settings.RECRAFT_API_KEY}",
                    "Content-Type": "application/json",
                },
                json={
                    "prompt": prompt,
                    "model": "recraftv4",
                    "n": 1,
                    "size": "1024x1024",
                    "response_format": "url",
                },
            )
            resp.raise_for_status()
            image_url = resp.json()["data"][0]["url"]

            img_resp = await client.get(image_url)
            img_resp.raise_for_status()
            return img_resp.content

    async def _recraft_vectorize(self, image_bytes: bytes) -> str:
        async with httpx.AsyncClient(timeout=90) as client:
            resp = await client.post(
                f"{RECRAFT_BASE}/images/vectorize",
                headers={"Authorization": f"Bearer {settings.RECRAFT_API_KEY}"},
                files={"file": ("logo.png", image_bytes, "image/png")},
            )
            resp.raise_for_status()
            svg_url = resp.json()["image"]["url"]

            svg_resp = await client.get(svg_url)
            svg_resp.raise_for_status()
            return svg_resp.text

    async def generate_logo(self, inputs: LogoInput, groq_fallback_fn) -> dict:
        if settings.RECRAFT_API_KEY:
            try:
                prompt    = _logo_prompt(inputs)
                logger.info(f"Recraft: generating logo for '{inputs.brand_name}'")
                png_bytes = await self._recraft_generate(prompt)
                svg_str   = await self._recraft_vectorize(png_bytes)
                logger.info(f"Recraft: done ({len(svg_str)} chars SVG)")
                return {"svg": svg_str, "png": png_bytes, "source": "recraft"}
            except Exception as e:
                logger.warning(f"Recraft failed, falling back to Groq: {e}")

        logger.info("Groq SVG fallback for logo generation")
        svg_str = await groq_fallback_fn(inputs)
        return {"svg": svg_str, "png": None, "source": "groq"}


logo_service = LogoService()