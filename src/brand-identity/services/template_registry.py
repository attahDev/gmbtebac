import hashlib
import random


def get_variation(asset_id: str) -> dict:
    seed = int(hashlib.md5(asset_id.encode()).hexdigest()[:8], 16)
    rng = random.Random(seed)
    return {
        "header_extra_mm":  rng.choice([0, 2, 4]),
        "section_gap_mm":   rng.choice([5, 6, 8]),
        "rule_thickness":   rng.choice([1.0, 1.5, 2.0]),
        "accent_bar_w_pt":  rng.choice([4, 5, 6]),
        "table_row_pad_pt": rng.choice([4, 5, 6]),
        "font_delta":       rng.choice([-1, 0, 1]),
        "header_tilt_pt":   rng.choice([18, 22, 26]),
        "footer_extra_mm":  rng.choice([0, 2, 3]),
    }


LETTERHEAD_TEMPLATES = {
    "corporate": {
        "name": "Corporate",
        "header_style":      "angular_block",
        "header_height_mm":  38,
        "footer_style":      "angular_corners",
        "contact_icons":     True,
        "watermark":         False,
        "body_top_mm":       50,
        "body_bottom_mm":    32,
        "body_left_mm":      20,
        "body_right_mm":     20,
    },
    "minimal": {
        "name": "Minimal",
        "header_style":      "logo_rule",
        "header_height_mm":  28,
        "footer_style":      "single_rule",
        "contact_icons":     False,
        "watermark":         False,
        "body_top_mm":       42,
        "body_bottom_mm":    25,
        "body_left_mm":      20,
        "body_right_mm":     20,
    },
    "dual_rule": {
        "name": "Dual Rule",
        "header_style":      "dual_rule",
        "header_height_mm":  30,
        "footer_style":      "diagonal_blocks",
        "contact_icons":     True,
        "watermark":         True,
        "body_top_mm":       44,
        "body_bottom_mm":    32,
        "body_left_mm":      20,
        "body_right_mm":     20,
    },
    "wave": {
        "name": "Wave",
        "header_style":      "wave_panel",
        "header_height_mm":  44,
        "footer_style":      "wave_panel",
        "contact_icons":     True,
        "watermark":         False,
        "body_top_mm":       58,
        "body_bottom_mm":    36,
        "body_left_mm":      20,
        "body_right_mm":     20,
    },
}

INVOICE_TEMPLATES = {
    "bold": {
        "name": "Bold",
        "header_style":    "diagonal_split",
        "title_in_header": True,
        "bill_badge":      True,
        "meta_badge":      True,
        "table_header":    "dark_bg",
        "payment_section": True,
        "terms_section":   True,
        "footer_style":    "thank_you_bar",
        "body_top_mm":     50,
        "body_bottom_mm":  30,
    },
    "professional": {
        "name": "Professional",
        "header_style":    "logo_title_rule",
        "title_in_header": False,
        "bill_badge":      False,
        "meta_badge":      False,
        "table_header":    "primary_bg",
        "payment_section": True,
        "terms_section":   False,
        "footer_style":    "full_bar_social",
        "body_top_mm":     48,
        "body_bottom_mm":  36,
    },
    "minimal": {
        "name": "Minimal",
        "header_style":    "text_only",
        "title_in_header": False,
        "bill_badge":      False,
        "meta_badge":      False,
        "table_header":    "line_only",
        "payment_section": False,
        "terms_section":   False,
        "footer_style":    "single_rule",
        "body_top_mm":     42,
        "body_bottom_mm":  26,
    },
}

QUOTATION_TEMPLATES = {
    "formal": {
        "name": "Formal",
        "header_style":      "centered_title",
        "layout":            "block",
        "show_delivery":     True,
        "show_signature":    False,
        "terms_section":     True,
        "footer_style":      "color_bar",
        "body_top_mm":       40,
        "body_bottom_mm":    28,
    },
    "modern": {
        "name": "Modern",
        "header_style":      "split_header",
        "layout":            "two_column",
        "show_delivery":     False,
        "show_signature":    True,
        "terms_section":     True,
        "footer_style":      "contact_bar",
        "body_top_mm":       36,
        "body_bottom_mm":    30,
    },
}

BUSINESS_CARD_TEMPLATES = {
    "classic": {
        "name": "Classic",
        "front_bg":        "primary",
        "back_left_panel": True,
        "accent_style":    "vertical_bar",
        "dot_cluster":     True,
    },
    "modern": {
        "name": "Modern",
        "front_bg":        "primary",
        "back_left_panel": False,
        "accent_style":    "diagonal_swoosh",
        "dot_cluster":     False,
    },
    "bold": {
        "name": "Bold",
        "front_bg":        "split",
        "back_left_panel": True,
        "accent_style":    "corner_cut",
        "dot_cluster":     True,
    },
    "minimal": {
        "name": "Minimal",
        "front_bg":        "white",
        "back_left_panel": False,
        "accent_style":    "rule_only",
        "dot_cluster":     False,
    },
}

EMAIL_SIGNATURE_TEMPLATES = {
    "dark_banner": {
        "name": "Dark Banner",
        "bg_style":       "dark_left_panel",
        "photo":          True,
        "photo_shape":    "circle",
        "layout":         "horizontal",
        "footer_bar":     True,
    },
    "minimal": {
        "name": "Minimal",
        "bg_style":       "white",
        "photo":          False,
        "photo_shape":    None,
        "layout":         "stacked",
        "footer_bar":     False,
    },
    "card": {
        "name": "Card",
        "bg_style":       "white",
        "photo":          True,
        "photo_shape":    "hexagon",
        "layout":         "horizontal",
        "footer_bar":     True,
    },
}

_REGISTRY = {
    "letterhead":      LETTERHEAD_TEMPLATES,
    "invoice":         INVOICE_TEMPLATES,
    "quotation":       QUOTATION_TEMPLATES,
    "business_card":   BUSINESS_CARD_TEMPLATES,
    "email_signature": EMAIL_SIGNATURE_TEMPLATES,
}


def get_template(doc_type: str, variant: str) -> dict:
    templates = _REGISTRY.get(doc_type, {})
    if variant in templates:
        return templates[variant]
    return next(iter(templates.values())) if templates else {}


def list_templates(doc_type: str) -> list[dict]:
    templates = _REGISTRY.get(doc_type, {})
    return [{"id": k, "name": v["name"]} for k, v in templates.items()]


BUSINESS_CARD_TEMPLATED_IDS = {
    "classic": {"front": "", "back": ""},
    "modern":  {"front": "", "back": ""},
    "bold":    {"front": "", "back": ""},
    "minimal": {"front": "", "back": ""},
}


def get_templated_ids(variant: str) -> dict:
    return BUSINESS_CARD_TEMPLATED_IDS.get(variant, {"front": "", "back": ""})
