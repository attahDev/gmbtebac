import logging
import httpx
from core.config import settings

logger = logging.getLogger(__name__)

TEMPLATED_BASE = "https://api.templated.io/v1"

TEMPLATED_TEMPLATE_IDS: dict[str, str] = {
    "business_card":   "09c4e428-d8b0-438e-9410-ffcadc4e716e",
    "letterhead":      "35450ba9-9e31-447d-9b37-05df9fb09c7e",
    "email_signature": "1694e480-5548-4505-9ac6-a8a0ded8b2fa",
    "invoice":         "",
    "quotation":       "",
}

PRIMARY_LAYERS = {
    "business_card": [
        ("fill",  "p1-primaryBg"),
        ("fill",  "p1-headerBlock"),
        ("fill",  "page-bg"),          # actual layer in template
        ("color", "p1-name"),
        ("color", "p1-title"),
    ],
    "letterhead": [
        ("fill",  "headerBg"),
        ("fill",  "footerBg"),
        ("color", "companyName"),
    ],
    "email_signature": [
        ("fill",  "leftPanel"),
        ("fill",  "bannerBg"),
        ("color", "name"),
    ],
    "invoice": [
        ("fill",  "headerBg"),
        ("fill",  "tableHeaderBg"),
        ("fill",  "totalRowBg"),
        ("color", "companyName"),
    ],
    "quotation": [
        ("fill",  "headerBg"),
        ("fill",  "tableHeaderBg"),
        ("fill",  "footerBar"),
        ("color", "companyName"),
    ],
}

SECONDARY_LAYERS = {
    "business_card": [
        ("fill",  "p1-accentBar"),
        ("fill",  "p2-bg-accent"),
        ("color", "p1-email"),
        ("color", "p1-phone"),
    ],
    "letterhead": [
        ("fill",  "accentRule"),
        ("color", "tagline"),
    ],
    "email_signature": [
        ("fill",  "accentDot"),
        ("color", "title"),
        ("color", "email"),
    ],
    "invoice": [
        ("fill",  "accentRule"),
        ("color", "invoiceLabel"),
    ],
    "quotation": [
        ("fill",  "accentRule"),
        ("color", "quoteLabel"),
    ],
}

BUSINESS_CARD_LAYERS: dict[str, tuple[str, str]] = {
    "full_name":           ("text",      "p1-name"),
    "job_title":           ("text",      "p1-title"),
    "company_name":        ("text",      "p1-company"),
    "email":               ("text",      "p1-email"),
    "phone":               ("text",      "p1-phone"),
    "website":             ("text",      "p1-website"),
    "registration_number": ("text",      "p1-registrationNumber"),  # VERIFY against template layer panel
    "logo_url":            ("image_url", "p1-logo"),
}

LETTERHEAD_LAYERS: dict[str, tuple[str, str]] = {
    "company_name":        ("text",      "companyName"),
    "company_address":     ("text",      "address"),
    "email":               ("text",      "email"),
    "phone":               ("text",      "phone"),
    "website":             ("text",      "website"),
    "tagline":             ("text",      "tagline"),
    "registration_number": ("text",      "registrationNumber"),
    "social_link":         ("text",      "socialLinks"),
    "content_body":        ("text",      "content-area-placeholder"),
    "logo_url":            ("image_url", "logo"),
}

EMAIL_SIGNATURE_LAYERS: dict[str, tuple[str, str]] = {
    "full_name":           ("text",      "name"),
    "job_title":           ("text",      "title"),
    "company":             ("text",      "company"),
    "email":               ("text",      "email"),
    "phone":               ("text",      "phone"),
    "banner_text":         ("text",      "bannerText"),
    "registration_number": ("text",      "registrationNumber"),  # VERIFY against template layer panel
    "social_link":         ("text",      "socialLinks"),
    "photo_url":           ("image_url", "photo"),
    "logo_url":            ("image_url", "logo"),
}

INVOICE_LAYERS: dict[str, tuple[str, str]] = {
    "company_name":          ("text",      "companyName"),
    "company_address":       ("text",      "address"),
    "email":                 ("text",      "email"),
    "phone":                 ("text",      "phone"),
    "website":               ("text",      "website"),
    "registration_number":   ("text",      "registrationNumber"),  # VERIFY against template layer panel
    "currency":              ("text",      "currency"),
    "invoice_number_prefix": ("text",      "invoicePrefix"),
    "tax_rate":              ("text",      "taxRate"),
    "discount":              ("text",      "discount"),
    "payment_terms":         ("text",      "paymentTerms"),
    "footer_note":           ("text",      "footerNote"),
    "terms_and_conditions":  ("text",      "termsAndConditions"),
    "logo_url":              ("image_url", "logo"),
}

QUOTATION_LAYERS: dict[str, tuple[str, str]] = {
    "company_name":         ("text",      "companyName"),
    "company_address":      ("text",      "address"),
    "email":                ("text",      "email"),
    "phone":                ("text",      "phone"),
    "website":              ("text",      "website"),
    "registration_number":  ("text",      "registrationNumber"),  # was on schema, never mapped — fixed
    "quote_valid_for":      ("text",      "validFor"),
    "quote_number_prefix":  ("text",      "quotePrefix"),
    "expiration_date":      ("text",      "expirationDate"),
    "prepared_by":          ("text",      "preparedBy"),
    "payment_terms":        ("text",      "paymentTerms"),
    "terms_and_conditions": ("text",      "termsAndConditions"),
    "currency":             ("text",      "currency"),
    "logo_url":             ("image_url", "logo"),
}

_LAYER_MAPS: dict[str, dict[str, tuple[str, str]]] = {
    "business_card":   BUSINESS_CARD_LAYERS,
    "letterhead":      LETTERHEAD_LAYERS,
    "email_signature": EMAIL_SIGNATURE_LAYERS,
    "invoice":          INVOICE_LAYERS,
    "quotation":       QUOTATION_LAYERS,
}

# Only these templates actually have a socialLinks layer — don't touch it on others
_ASSETS_WITH_SOCIAL = {"business_card", "email_signature"}


def _build_layers(asset_type: str, inputs: dict) -> dict:
    layers: dict = {}

    layer_map = _LAYER_MAPS[asset_type]
    for input_key, (prop, layer_name) in layer_map.items():
        value = inputs.get(input_key)

        if value is None or value == "":
            layers[layer_name] = {"hide": True}
            continue

        if hasattr(value, "value"):
            value = value.value
        if isinstance(value, bool):
            value = "Yes" if value else "No"
        if isinstance(value, (int, float)):
            value = str(value)

        layers[layer_name] = {prop: value}

    primary = inputs.get("primary_color")
    if primary:
        for prop, layer_name in PRIMARY_LAYERS.get(asset_type, []):
            layers.setdefault(layer_name, {})[prop] = primary

    secondary = inputs.get("secondary_color")
    if secondary:
        for prop, layer_name in SECONDARY_LAYERS.get(asset_type, []):
            layers.setdefault(layer_name, {})[prop] = secondary

    # socialLinks only exists on business_card and email_signature templates
    if asset_type in _ASSETS_WITH_SOCIAL:
        social_links = inputs.get("social_links")
        if social_links:
            urls = []
            for link in social_links:
                if isinstance(link, dict):
                    urls.append(link.get("url", ""))
                elif hasattr(link, "url"):
                    urls.append(link.url)
            joined = ", ".join(filter(None, urls))
            if joined:
                layers["socialLinks"] = {"text": joined}
            else:
                layers["socialLinks"] = {"hide": True}
        else:
            layers["socialLinks"] = {"hide": True}

    # letterhead has a content-area-placeholder layer that must always be hidden
    if asset_type == "letterhead":
        layers.setdefault("content-area-placeholder", {"hide": True})

    return layers


class TemplatedService:

    def is_configured(self, asset_type: str) -> bool:
        return bool(
            settings.TEMPLATED_API_KEY
            and self._get_template_id(asset_type, {})
        )

    def _get_template_id(self, asset_type: str, inputs: dict) -> str:
        return (
            inputs.get("templated_template_id")
            or TEMPLATED_TEMPLATE_IDS.get(asset_type, "")
        )

    async def render(
        self,
        asset_type: str,
        inputs: dict,
        output_format: str = "png",
    ) -> bytes:
        if asset_type not in _LAYER_MAPS:
            raise ValueError(f"Templated: unsupported asset_type '{asset_type}'")

        template_id = self._get_template_id(asset_type, inputs)
        if not template_id:
            raise ValueError(
                f"Templated: no template ID for '{asset_type}'. "
                f"Set TEMPLATED_TEMPLATE_IDS['{asset_type}'] in templated_service.py "
                f"or pass templated_template_id in the request."
            )

        if not settings.TEMPLATED_API_KEY:
            raise ValueError(
                "Templated: TEMPLATED_API_KEY not set. "
                "Add it to .env: TEMPLATED_API_KEY=your_key_here"
            )

        layers = _build_layers(asset_type, inputs)

        logger.info("=== TEMPLATED PAYLOAD ===")
        logger.info(layers)

        logger.info(
            f"Templated: rendering '{asset_type}' template='{template_id}' "
            f"layers={list(layers.keys())} format={output_format}"
        )

        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.post(
                f"{TEMPLATED_BASE}/render",
                headers={
                    "Authorization": f"Bearer {settings.TEMPLATED_API_KEY}",
                    "Content-Type": "application/json",
                },
                json={
                    "template": template_id,
                    "format": output_format,
                    "layers": layers,
                },
            )
            try:
                resp.raise_for_status()
            except httpx.HTTPStatusError as e:
                body = e.response.text
                logger.error(f"❌ Templated error ({e.response.status_code}): {body}")
                raise ValueError(
                    f"Templated render failed ({e.response.status_code}) "
                    f"for template '{template_id}': {body}"
                ) from e

            result = resp.json()
            logger.info("=== TEMPLATED RESPONSE ===")
            logger.info(result)
            if isinstance(result, list):
                result = result[0]

        render_url = result.get("url")
        if not render_url:
            raise ValueError(f"Templated: no 'url' in response: {result}")

        if result.get("status") == "FAILED":
            raise ValueError(f"Templated: render failed: {result}")

        logger.info(f"Templated: downloading from {render_url}")
        async with httpx.AsyncClient(timeout=60) as client:
            file_resp = await client.get(render_url)
            file_resp.raise_for_status()

            if not file_resp.content:
                raise ValueError(
                    f"Templated returned empty output for {asset_type}"
                )

            return file_resp.content


templated_service = TemplatedService()
