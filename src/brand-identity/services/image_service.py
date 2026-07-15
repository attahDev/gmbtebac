
import io
import re
import logging
from PIL import Image, ImageDraw, ImageFont
import cairosvg
from services.color_service import color_service
from services.template_registry import get_template, get_variation

logger = logging.getLogger(__name__)

# Business card at 300 dpi — standard 3.5 x 2 inches
CARD_W = 1050
CARD_H = 600

# Email signature canvas
SIG_W = 720
SIG_H = 220

FONT_BOLD = [
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
    "/usr/share/fonts/truetype/freefont/FreeSansBold.ttf",
]
FONT_REGULAR = [
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
    "/usr/share/fonts/truetype/freefont/FreeSans.ttf",
]


def _font(paths: list, size: int) -> ImageFont.FreeTypeFont:
    for p in paths:
        try:
            return ImageFont.truetype(p, size)
        except (IOError, OSError):
            continue
    return ImageFont.load_default()


def _hex_to_rgb(hex_color: str) -> tuple:
    return color_service.hex_to_rgb_tuple(hex_color)


def _lum(r, g, b) -> float:
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255


def _on_dark(r, g, b) -> tuple:
    return (255, 255, 255) if _lum(r, g, b) < 0.55 else (20, 20, 40)


def _circle_crop(img: Image.Image, size: int) -> Image.Image:
    """Crop image to a circle of given diameter."""
    img = img.resize((size, size), Image.LANCZOS).convert("RGBA")
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).ellipse([0, 0, size, size], fill=255)
    result = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    result.paste(img, mask=mask)
    return result


def _fetch_logo(logo_url: str, target_h: int = 60) -> Image.Image | None:
    """Fetch a logo from URL and resize to target_h, preserving aspect ratio."""
    if not logo_url:
        return None
    try:
        import httpx
        resp = httpx.get(logo_url, timeout=8, follow_redirects=True)
        resp.raise_for_status()
        img = Image.open(io.BytesIO(resp.content)).convert("RGBA")
        ratio = target_h / img.height
        new_w = max(1, int(img.width * ratio))
        return img.resize((new_w, target_h), Image.LANCZOS)
    except Exception as e:
        logger.warning(f"Logo fetch failed ({logo_url}): {e}")
        return None


def _paste_logo(canvas: Image.Image, logo: Image.Image | None, x: int, y: int) -> None:
    if logo is None:
        return
    if canvas.mode != "RGBA":
        tmp = canvas.convert("RGBA")
        tmp.paste(logo, (x, y), logo)
        canvas.paste(tmp.convert(canvas.mode), (0, 0))
    else:
        canvas.paste(logo, (x, y), logo)


class ImageService:

    # ─── Business Card ────────────────────────────────────────────────────────

    def build_business_card_png(self, inputs: dict, style_hint: dict) -> bytes:
        variant = inputs.get("template_variant", "classic")
        var     = get_variation(inputs.get("asset_id", "default"))

        primary   = inputs.get("primary_color",   "#001F3F")
        secondary = inputs.get("secondary_color", "#D7263D")
        pr, pg, pb = _hex_to_rgb(primary)
        sr, sg, sb = _hex_to_rgb(secondary)

        gap    = 40
        canvas = Image.new("RGB", (CARD_W, CARD_H * 2 + gap), (240, 240, 245))

        # Fetch logo once, use on both sides
        logo = _fetch_logo(inputs.get("logo_url"), target_h=52)

        front = self._bc_front(inputs, variant, pr, pg, pb, sr, sg, sb, var, logo)
        back  = self._bc_back(inputs, variant, pr, pg, pb, sr, sg, sb, var, logo)

        canvas.paste(front, (0, 0))
        canvas.paste(back,  (0, CARD_H + gap))

        buf = io.BytesIO()
        canvas.save(buf, format="PNG", dpi=(300, 300))
        return buf.getvalue()

    # ── Front face ────────────────────────────────────────────────────────────

    def _bc_front(self, inputs, variant, pr, pg, pb, sr, sg, sb, var, logo=None):
        img  = Image.new("RGB", (CARD_W, CARD_H), (pr, pg, pb))
        draw = ImageDraw.Draw(img)

        name    = inputs.get("full_name", "")
        title   = inputs.get("job_title", "")
        company = inputs.get("company_name", "")
        email   = inputs.get("email", "")
        phone   = inputs.get("phone", "")
        website = inputs.get("website", "")

        fn_name   = _font(FONT_BOLD,    56)
        fn_title  = _font(FONT_REGULAR, 28)
        fn_detail = _font(FONT_REGULAR, 23)

        if variant == "modern":
            # Curved swoosh: large faded ellipse bottom-right
            for i in range(60, 0, -2):
                shade = tuple(min(255, c + i) for c in (pr, pg, pb))
                draw.ellipse([CARD_W - 340 + i, CARD_H - 300 + i,
                              CARD_W + 80 - i,  CARD_H + 80 - i], fill=shade)
            draw.rectangle([(0, 0), (CARD_W, 6)], fill=(sr, sg, sb))

        elif variant == "bold":
            dark = tuple(max(0, c - 30) for c in (pr, pg, pb))
            draw.rectangle([(0, 0), (CARD_W // 2, CARD_H)], fill=dark)
            draw.rectangle([(CARD_W // 2, 0), (CARD_W // 2 + 6, CARD_H)], fill=(sr, sg, sb))

        elif variant == "minimal":
            img  = Image.new("RGB", (CARD_W, CARD_H), (255, 255, 255))
            draw = ImageDraw.Draw(img)
            draw.rectangle([(0, 0), (8, CARD_H)], fill=(pr, pg, pb))
            fn_name   = _font(FONT_BOLD,    52)
            fn_title  = _font(FONT_REGULAR, 26)
            fn_detail = _font(FONT_REGULAR, 21)
            # Logo top-right on white card
            if logo:
                logo_x = CARD_W - logo.width - 28
                _paste_logo(img, logo, logo_x, 28)
            draw.text((28, 80),  name,    fill=(pr, pg, pb),   font=fn_name)
            draw.text((30, 152), title,   fill=(sr, sg, sb),   font=fn_title)
            draw.text((30, 190), company, fill=(80, 90, 110),  font=fn_detail)
            draw.rectangle([(28, 240), (260, 242)], fill=(sr, sg, sb))
            cy = 255
            for val in [email, phone, website]:
                if val:
                    draw.text((28, cy), val, fill=(60, 70, 90), font=fn_detail)
                    cy += 32
            draw.rectangle([(0, CARD_H - 8), (CARD_W, CARD_H)], fill=(pr, pg, pb))
            return img

        elif variant == "geometric":
            # Dark card with large diagonal triangle accent bottom-left
            draw.rectangle([(0, 0), (CARD_W, CARD_H)], fill=(pr, pg, pb))
            # Triangle: bottom-left corner
            pts = [(0, CARD_H), (0, CARD_H * 2 // 5), (CARD_W * 2 // 5, CARD_H)]
            draw.polygon(pts, fill=(sr, sg, sb))
            # Thin top rule
            draw.rectangle([(0, 0), (CARD_W, 5)], fill=(sr, sg, sb))
            # Right-side dot grid
            dot_x, dot_y = CARD_W - 80, 30
            for dx in range(3):
                for dy in range(4):
                    draw.ellipse([dot_x + dx*22, dot_y + dy*22,
                                  dot_x + dx*22 + 8, dot_y + dy*22 + 8], fill=(sr, sg, sb))
            txt_color = (255, 255, 255)
            if logo:
                _paste_logo(img, logo, 40, 30)
                y_name = 100
            else:
                y_name = 50
            draw.text((40, y_name),      name,    fill=txt_color,    font=_font(FONT_BOLD, 52))
            draw.text((42, y_name + 64), title,   fill=(sr, sg, sb), font=fn_title)
            draw.text((42, y_name + 100),company, fill=(200, 210, 225), font=fn_detail)
            cy = CARD_H - 170
            for icon, val in [("✉", email), ("✆", phone), ("⊕", website)]:
                if val:
                    draw.text((40, cy),  icon, fill=(sr, sg, sb), font=_font(FONT_BOLD, 20))
                    draw.text((68, cy),  val,  fill=(220, 230, 242), font=fn_detail)
                    cy += 36
            return img

        elif variant == "gradient":
            # Simulate gradient with horizontal bands fading primary→secondary
            steps = 80
            for i in range(steps):
                t = i / steps
                r = int(pr + (sr - pr) * t)
                g = int(pg + (sg - pg) * t)
                b = int(pb + (sb - pb) * t)
                x0 = int(CARD_W * i / steps)
                x1 = int(CARD_W * (i + 1) / steps) + 1
                draw.rectangle([(x0, 0), (x1, CARD_H)], fill=(r, g, b))
            # Overlay semi-dark bottom strip for text contrast
            draw.rectangle([(0, CARD_H // 2), (CARD_W, CARD_H)], fill=(0, 0, 0, 100))
            img2 = img.convert("RGBA")
            overlay = Image.new("RGBA", img.size, (0, 0, 0, 0))
            ImageDraw.Draw(overlay).rectangle([(0, CARD_H // 2), (CARD_W, CARD_H)], fill=(0, 0, 0, 80))
            img = Image.alpha_composite(img2, overlay).convert("RGB")
            draw = ImageDraw.Draw(img)
            if logo:
                _paste_logo(img, logo, CARD_W - logo.width - 30, 24)
            draw.text((40, CARD_H // 2 + 20), name,    fill=(255,255,255), font=_font(FONT_BOLD, 52))
            draw.text((42, CARD_H // 2 + 84), title,   fill=(240,240,240), font=fn_title)
            draw.text((42, CARD_H // 2 + 118),company, fill=(220,230,242), font=fn_detail)
            cy = CARD_H - 60
            for val in [email, phone]:
                if val:
                    draw.text((40, cy), val, fill=(230,240,255), font=_font(FONT_REGULAR, 21))
                    cy += 30
            return img

        else:  # classic
            for i in range(80, 0, -1):
                shade = tuple(min(255, c + i) for c in (pr, pg, pb))
                draw.ellipse([CARD_W - 320 + (80 - i), -160 + (80 - i),
                              CARD_W + 160 - (80 - i), 320 - (80 - i)], fill=shade)

        # Shared: vertical accent bar left + dot cluster top-right
        draw.rectangle([(0, 0), (8, CARD_H)], fill=(sr, sg, sb))
        dot_x, dot_y = CARD_W - 60, 38
        for dx, dy in [(0, 0), (22, 0), (44, 0), (0, 22), (22, 22)]:
            draw.ellipse([dot_x + dx, dot_y + dy, dot_x + dx + 10, dot_y + dy + 10],
                         fill=(sr, sg, sb))

        # Logo top-right area (before text so text doesn't overlap)
        if logo:
            lx = CARD_W - logo.width - 60
            _paste_logo(img, logo, lx, 28)

        txt_color = (255, 255, 255)
        draw.text((60, 90),  name,    fill=txt_color,       font=fn_name)
        draw.text((62, 164), title,   fill=(sr, sg, sb),    font=fn_title)
        draw.text((62, 202), company, fill=(200, 210, 225), font=fn_detail)
        draw.rectangle([(60, CARD_H - 185), (CARD_W - 60, CARD_H - 183)], fill=(sr, sg, sb))

        cy = CARD_H - 170
        for icon, val in [("✉", email), ("✆", phone), ("⊕", website)]:
            if val:
                draw.text((60, cy), icon, fill=(sr, sg, sb),    font=_font(FONT_BOLD, 20))
                draw.text((90, cy), val,  fill=(220, 230, 242), font=fn_detail)
                cy += 36

        draw.rectangle([(0, CARD_H - 10), (CARD_W, CARD_H)], fill=(sr, sg, sb))
        return img
        img  = Image.new("RGB", (CARD_W, CARD_H), (pr, pg, pb))
        draw = ImageDraw.Draw(img)

        name    = inputs.get("full_name", "")
        title   = inputs.get("job_title", "")
        company = inputs.get("company_name", "")
        email   = inputs.get("email", "")
        phone   = inputs.get("phone", "")
        website = inputs.get("website", "")

        fn_name   = _font(FONT_BOLD,    56)
        fn_title  = _font(FONT_REGULAR, 28)
        fn_detail = _font(FONT_REGULAR, 23)

        if variant == "modern":
            # Curved swoosh: large faded ellipse bottom-right
            for i in range(60, 0, -2):
                shade = tuple(min(255, c + i) for c in (pr, pg, pb))
                draw.ellipse([CARD_W - 340 + i, CARD_H - 300 + i,
                              CARD_W + 80 - i,  CARD_H + 80 - i], fill=shade)
            # Thin top accent line
            draw.rectangle([(0, 0), (CARD_W, 6)], fill=(sr, sg, sb))

        elif variant == "bold":
            # Split: left half darker
            dark = tuple(max(0, c - 30) for c in (pr, pg, pb))
            draw.rectangle([(0, 0), (CARD_W // 2, CARD_H)], fill=dark)
            draw.rectangle([(CARD_W // 2, 0), (CARD_W // 2 + 6, CARD_H)], fill=(sr, sg, sb))

        elif variant == "minimal":
            # White card, left accent bar
            img  = Image.new("RGB", (CARD_W, CARD_H), (255, 255, 255))
            draw = ImageDraw.Draw(img)
            draw.rectangle([(0, 0), (8, CARD_H)], fill=(pr, pg, pb))
            fn_name   = _font(FONT_BOLD,    52)
            fn_title  = _font(FONT_REGULAR, 26)
            fn_detail = _font(FONT_REGULAR, 21)
            draw.text((28, 80),  name,    fill=(pr, pg, pb),   font=fn_name)
            draw.text((30, 152), title,   fill=(sr, sg, sb),   font=fn_title)
            draw.text((30, 190), company, fill=(80, 90, 110),  font=fn_detail)
            draw.rectangle([(28, 240), (260, 242)], fill=(sr, sg, sb))
            cy = 255
            for val in [email, phone, website]:
                if val:
                    draw.text((28, cy), val, fill=(60, 70, 90), font=fn_detail)
                    cy += 32
            draw.rectangle([(0, CARD_H - 8), (CARD_W, CARD_H)], fill=(pr, pg, pb))
            return img

        else:  # classic
            # Large faded circle top-right
            for i in range(80, 0, -1):
                shade = tuple(min(255, c + i) for c in (pr, pg, pb))
                draw.ellipse([CARD_W - 320 + (80 - i), -160 + (80 - i),
                              CARD_W + 160 - (80 - i), 320 - (80 - i)], fill=shade)

        # Shared: vertical accent bar left + dot cluster top-right
        draw.rectangle([(0, 0), (8, CARD_H)], fill=(sr, sg, sb))
        dot_x, dot_y = CARD_W - 60, 38
        for dx, dy in [(0, 0), (22, 0), (44, 0), (0, 22), (22, 22)]:
            draw.ellipse([dot_x + dx, dot_y + dy, dot_x + dx + 10, dot_y + dy + 10],
                         fill=(sr, sg, sb))

        txt_color = (255, 255, 255) if variant != "minimal" else (pr, pg, pb)
        draw.text((60, 90),  name,    fill=txt_color,       font=fn_name)
        draw.text((62, 164), title,   fill=(sr, sg, sb),    font=fn_title)
        draw.text((62, 202), company, fill=(200, 210, 225), font=fn_detail)
        draw.rectangle([(60, CARD_H - 185), (CARD_W - 60, CARD_H - 183)], fill=(sr, sg, sb))

        cy = CARD_H - 170
        for icon, val in [("✉", email), ("✆", phone), ("⊕", website)]:
            if val:
                draw.text((60, cy), icon, fill=(sr, sg, sb),    font=_font(FONT_BOLD, 20))
                draw.text((90, cy), val,  fill=(220, 230, 242), font=fn_detail)
                cy += 36

        draw.rectangle([(0, CARD_H - 10), (CARD_W, CARD_H)], fill=(sr, sg, sb))
        return img

    # ── Back face ─────────────────────────────────────────────────────────────

    def _bc_back(self, inputs, variant, pr, pg, pb, sr, sg, sb, var, logo=None):
        company = inputs.get("company_name", "")
        back    = Image.new("RGB", (CARD_W, CARD_H), (255, 255, 255))
        draw    = ImageDraw.Draw(back)

        fn_company = _font(FONT_BOLD,    52)
        fn_sub     = _font(FONT_REGULAR, 20)

        if variant == "bold":
            # Dark full background, large company name centered
            back = Image.new("RGB", (CARD_W, CARD_H), (pr, pg, pb))
            draw = ImageDraw.Draw(back)
            draw.rectangle([(0, 0), (CARD_W, 8)], fill=(sr, sg, sb))
            draw.rectangle([(0, CARD_H - 8), (CARD_W, CARD_H)], fill=(sr, sg, sb))
            if logo:
                lx = (CARD_W - logo.width) // 2
                _paste_logo(back, logo, lx, 40)
                name_y = 40 + logo.height + 20
            else:
                name_y = (CARD_H - 60) // 2
            bbox = draw.textbbox((0, 0), company.upper(), font=fn_company)
            tw   = bbox[2] - bbox[0]
            draw.text(((CARD_W - tw) // 2, name_y),
                      company.upper(), fill=(255, 255, 255), font=fn_company)
            return back

        elif variant in ("geometric", "gradient"):
            # Back: white card, company centered with colour rule
            if logo:
                lx = (CARD_W - logo.width) // 2
                _paste_logo(back, logo, lx, 60)
                y_co = 60 + logo.height + 20
            else:
                y_co = CARD_H // 2 - 30
            bbox = draw.textbbox((0, 0), company.upper(), font=fn_company)
            tw   = bbox[2] - bbox[0]
            draw.text(((CARD_W - tw) // 2, y_co), company.upper(), fill=(pr, pg, pb), font=fn_company)
            draw.rectangle([((CARD_W - tw) // 2, y_co + bbox[3] - bbox[1] + 10),
                             ((CARD_W + tw) // 2, y_co + bbox[3] - bbox[1] + 14)], fill=(sr, sg, sb))
            draw.rectangle([(0, 0), (CARD_W, 6)], fill=(sr, sg, sb))
            draw.rectangle([(0, CARD_H - 6), (CARD_W, CARD_H)], fill=(pr, pg, pb))
            return back

        elif variant == "minimal":
            # White, just company name right-aligned + subtle rule
            bbox = draw.textbbox((0, 0), company, font=fn_company)
            tw   = bbox[2] - bbox[0]
            draw.text((CARD_W - tw - 40, CARD_H // 2 - 36),
                      company, fill=(pr, pg, pb), font=fn_company)
            draw.rectangle([(40, CARD_H // 2 + 28), (CARD_W - 40, CARD_H // 2 + 32)],
                           fill=(sr, sg, sb))
            website = inputs.get("website", "")
            if website:
                wb = draw.textbbox((0, 0), website, font=fn_sub)
                ww = wb[2] - wb[0]
                draw.text(((CARD_W - ww) // 2, CARD_H // 2 + 44), website,
                          fill=(120, 130, 150), font=fn_sub)
            return back

        # classic / modern: left panel layout
        panel_w = int(CARD_W * 0.38)
        draw.rectangle([(0, 0), (panel_w, CARD_H)], fill=(pr, pg, pb))
        draw.ellipse([panel_w - 120, CARD_H - 180, panel_w + 80, CARD_H + 20],
                     fill=(sr, sg, sb))
        for row in range(4):
            for col in range(3):
                dx, dy = 40 + col * 22, 40 + row * 22
                draw.ellipse([dx, dy, dx + 7, dy + 7], fill=(sr, sg, sb))

        right_x = panel_w + 40
        right_w = CARD_W - panel_w - 40
        co_upper = company.upper()
        bbox = draw.textbbox((0, 0), co_upper, font=fn_company)
        tw   = bbox[2] - bbox[0]
        if tw > right_w - 20:
            fn_company = _font(FONT_BOLD, 36)
            bbox = draw.textbbox((0, 0), co_upper, font=fn_company)
            tw   = bbox[2] - bbox[0]

        tx = right_x + (right_w - tw) // 2
        draw.text((tx, 220), co_upper, fill=(pr, pg, pb), font=fn_company)
        draw.rectangle([tx, bbox[3] + 228, tx + tw, bbox[3] + 232], fill=(sr, sg, sb))

        industry = inputs.get("industry", "")
        if industry:
            ib = draw.textbbox((0, 0), industry, font=fn_sub)
            iw = ib[2] - ib[0]
            draw.text((right_x + (right_w - iw) // 2, bbox[3] + 244),
                      industry, fill=(120, 130, 150), font=fn_sub)

        draw.rectangle([(panel_w, 0), (CARD_W, 6)], fill=(pr, pg, pb))
        draw.rectangle([(panel_w, CARD_H - 6), (CARD_W, CARD_H)], fill=(sr, sg, sb))
        return back

    # ─── Email Signature ──────────────────────────────────────────────────────

    def build_email_signature_png(self, inputs: dict) -> bytes:
        variant   = inputs.get("template_variant", "minimal")
        primary   = inputs.get("primary_color",   "#001F3F")
        secondary = inputs.get("secondary_color", "#D7263D")
        pr, pg, pb = _hex_to_rgb(primary)
        sr, sg, sb = _hex_to_rgb(secondary)

        # Consolidate social links — support both old singular and new list
        social_links = inputs.get("social_links") or []
        if not social_links and inputs.get("social_link"):
            social_links = [{"platform": "Social", "url": inputs["social_link"]}]

        if variant == "dark_banner":
            return self._sig_dark_banner(inputs, pr, pg, pb, sr, sg, sb, social_links)
        elif variant == "card":
            return self._sig_card(inputs, pr, pg, pb, sr, sg, sb, social_links)
        else:
            return self._sig_minimal(inputs, pr, pg, pb, sr, sg, sb, social_links)

    def _sig_minimal(self, inputs, pr, pg, pb, sr, sg, sb, social_links):
        """Left accent bar, name/title/company, rule, contacts + social."""
        img  = Image.new("RGB", (SIG_W, SIG_H), (255, 255, 255))
        draw = ImageDraw.Draw(img)

        draw.rectangle([(0, 0), (6, SIG_H)], fill=(pr, pg, pb))
        draw.rectangle([(0, 0), (SIG_W, 3)], fill=(sr, sg, sb))

        fn_name   = _font(FONT_BOLD,    28)
        fn_role   = _font(FONT_REGULAR, 18)
        fn_detail = _font(FONT_REGULAR, 16)

        x = 22
        # Logo top-right
        logo = _fetch_logo(inputs.get("logo_url"), target_h=44)
        if logo:
            _paste_logo(img, logo, SIG_W - logo.width - 16, 10)

        draw.text((x, 16), inputs.get("full_name", ""),  fill=(pr, pg, pb), font=fn_name)
        draw.text((x, 52), inputs.get("job_title", ""),  fill=(sr, sg, sb), font=fn_role)
        draw.text((x, 74), inputs.get("company",  ""),   fill=(70, 80, 100), font=fn_role)
        draw.line([(x, 104), (SIG_W - 20, 104)], fill=(220, 225, 235), width=1)

        y = 114
        for val in [inputs.get("email"), inputs.get("phone")]:
            if val:
                draw.text((x, y), val, fill=(90, 100, 120), font=fn_detail)
                y += 22
        for link in social_links[:3]:
            url = link.get("url") or link if isinstance(link, str) else ""
            plat = link.get("platform", "") if isinstance(link, dict) else ""
            label = f"{plat}: {url}" if plat else url
            if label.strip():
                draw.text((x, y), label, fill=(sr, sg, sb), font=fn_detail)
                y += 22

        banner = inputs.get("banner_text")
        if banner and y < SIG_H - 20:
            draw.rectangle([(0, SIG_H - 22), (SIG_W, SIG_H)], fill=(pr, pg, pb))
            draw.text((x, SIG_H - 19), banner, fill=(200, 210, 225),
                      font=_font(FONT_REGULAR, 13))

        buf = io.BytesIO()
        img.save(buf, format="PNG", dpi=(150, 150))
        return buf.getvalue()

    def _sig_dark_banner(self, inputs, pr, pg, pb, sr, sg, sb, social_links):
        """
        Dark left panel with optional circular photo, name+title+socials,
        contact details right, footer bar with logo area + banner text.
        """
        h   = SIG_H + 30
        img = Image.new("RGB", (SIG_W, h), (255, 255, 255))
        draw = ImageDraw.Draw(img)

        # Dark left panel
        panel_w = 260
        draw.rectangle([(0, 0), (panel_w, h - 28)], fill=(pr, pg, pb))

        fn_name   = _font(FONT_BOLD,    22)
        fn_role   = _font(FONT_REGULAR, 15)
        fn_detail = _font(FONT_REGULAR, 14)

        x_left = 14
        # Photo circle
        photo_url = inputs.get("photo_url")
        y_after_photo = 16
        if photo_url:
            try:
                import httpx
                resp = httpx.get(photo_url, timeout=10)
                photo = Image.open(io.BytesIO(resp.content))
                circ = _circle_crop(photo, 72)
                # paste RGBA circle onto dark panel
                img.paste(circ, (x_left, 16), circ)
                y_after_photo = 98
            except Exception as e:
                logger.warning(f"Could not load photo_url: {e}")

        draw.text((x_left, y_after_photo),      inputs.get("full_name", ""),
                  fill=(255, 255, 255), font=fn_name)
        draw.text((x_left, y_after_photo + 26), inputs.get("job_title", ""),
                  fill=(sr, sg, sb),   font=fn_role)
        draw.text((x_left, y_after_photo + 46), inputs.get("company", ""),
                  fill=(180, 195, 215), font=fn_role)

        # Social icons row
        sy = y_after_photo + 70
        for link in social_links[:3]:
            plat = (link.get("platform", "") if isinstance(link, dict) else "").upper()[:2]
            if plat:
                draw.ellipse([x_left, sy, x_left + 18, sy + 18], fill=(sr, sg, sb))
                draw.text((x_left + 4, sy + 1), plat[:1],
                          fill=(255, 255, 255), font=_font(FONT_BOLD, 11))
                x_left += 24
        x_left = 14  # reset

        # Right panel: contact details
        rx = panel_w + 20
        ry = 20
        for icon, val in [("✉", inputs.get("email")),
                          ("✆", inputs.get("phone"))]:
            if val:
                draw.text((rx, ry),      icon, fill=(sr, sg, sb),   font=fn_detail)
                draw.text((rx + 20, ry), val,  fill=(60, 70, 90),   font=fn_detail)
                ry += 24
        for link in social_links[:3]:
            url = link.get("url", "") if isinstance(link, dict) else str(link)
            if url:
                draw.text((rx + 20, ry), url, fill=(sr, sg, sb), font=fn_detail)
                ry += 22

        # Footer bar
        draw.rectangle([(0, h - 28), (SIG_W, h)], fill=(pr, pg, pb))
        banner = inputs.get("banner_text") or ""
        if banner:
            draw.text((14, h - 22), banner, fill=(180, 195, 215),
                      font=_font(FONT_REGULAR, 12))
        # Logo in footer bar right side
        logo = _fetch_logo(inputs.get("logo_url"), target_h=20)
        if logo:
            _paste_logo(img, logo, SIG_W - logo.width - 14, h - 24)

        buf = io.BytesIO()
        img.save(buf, format="PNG", dpi=(150, 150))
        return buf.getvalue()

    def _sig_card(self, inputs, pr, pg, pb, sr, sg, sb, social_links):
        """
        White card, hexagon/circle photo left, name+title center, contacts right.
        """
        img  = Image.new("RGB", (SIG_W, SIG_H), (255, 255, 255))
        draw = ImageDraw.Draw(img)

        # Bottom accent bar
        draw.rectangle([(0, SIG_H - 24), (SIG_W, SIG_H)], fill=(pr, pg, pb))
        # Left rule
        draw.rectangle([(0, 0), (4, SIG_H - 24)], fill=(sr, sg, sb))

        fn_name   = _font(FONT_BOLD,    24)
        fn_role   = _font(FONT_REGULAR, 16)
        fn_detail = _font(FONT_REGULAR, 14)

        # Photo
        photo_url = inputs.get("photo_url")
        x_offset  = 16
        if photo_url:
            try:
                import httpx
                resp = httpx.get(photo_url, timeout=10)
                photo = Image.open(io.BytesIO(resp.content))
                circ  = _circle_crop(photo, 80)
                img.paste(circ, (x_offset, (SIG_H - 24 - 80) // 2), circ)
                x_offset = 110
            except Exception as e:
                logger.warning(f"Photo load failed: {e}")

        # Name / title
        draw.text((x_offset, 22), inputs.get("full_name", ""),
                  fill=(pr, pg, pb), font=fn_name)
        draw.text((x_offset, 52), inputs.get("job_title", ""),
                  fill=(sr, sg, sb), font=fn_role)
        draw.text((x_offset, 74), inputs.get("company",  ""),
                  fill=(80, 90, 110), font=fn_role)
        draw.line([(x_offset, 100), (x_offset + 200, 100)], fill=(sr, sg, sb), width=2)

        # Contact right
        cx = SIG_W - 220
        cy = 22
        for icon, val in [("✉", inputs.get("email")), ("✆", inputs.get("phone"))]:
            if val:
                draw.text((cx, cy),      icon, fill=(sr, sg, sb), font=fn_detail)
                draw.text((cx + 20, cy), val,  fill=(60, 70, 90), font=fn_detail)
                cy += 24
        for link in social_links[:2]:
            url = link.get("url", "") if isinstance(link, dict) else str(link)
            if url:
                draw.text((cx + 20, cy), url, fill=(sr, sg, sb), font=fn_detail)
                cy += 22

        # Banner text on footer bar
        banner = inputs.get("banner_text")
        if banner:
            draw.text((16, SIG_H - 20), banner, fill=(200, 210, 225),
                      font=_font(FONT_REGULAR, 12))
        # Logo on footer bar right
        logo = _fetch_logo(inputs.get("logo_url"), target_h=20)
        if logo:
            _paste_logo(img, logo, SIG_W - logo.width - 14, SIG_H - 22)

        buf = io.BytesIO()
        img.save(buf, format="PNG", dpi=(150, 150))
        return buf.getvalue()

    # ─── Logo Variants ────────────────────────────────────────────────────────

    def svg_to_png(self, svg_string: str, width: int = 800) -> bytes:
        try:
            return cairosvg.svg2png(
                bytestring=svg_string.encode("utf-8"),
                output_width=width,
            )
        except Exception as e:
            logger.error(f"CairoSVG conversion failed: {e}")
            raise RuntimeError(f"Failed to convert SVG to PNG: {e}")

    def build_logo_light_png(self, svg: str) -> bytes:
        content  = self._extract_svg_content(svg)
        light_svg = (
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 200" width="800" height="400">'
            '<rect width="100%" height="100%" fill="#FFFFFF"/>'
            f'{content}</svg>'
        )
        return self.svg_to_png(light_svg)

    def build_logo_dark_png(self, svg: str) -> bytes:
        content = self._extract_svg_content(svg)
        content = re.sub(r'fill="#0[0-9A-Fa-f]{5}"', 'fill="#FFFFFF"', content)
        dark_svg = (
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 200" width="800" height="400">'
            '<rect width="100%" height="100%" fill="#0A0A0A"/>'
            f'{content}</svg>'
        )
        return self.svg_to_png(dark_svg)

    def build_logo_transparent_png(self, svg: str) -> bytes:
        clean = re.sub(
            r'<rect[^>]*(fill=["\'](?:white|#[Ff]{3,6}|#[Ff][Ff][Ff][Ff][Ff][Ff])["\'])[^/]*/?>',
            "", svg
        )
        return self.svg_to_png(clean)

    def _extract_svg_content(self, svg: str) -> str:
        match = re.search(r"<svg[^>]*>(.*)</svg>", svg, re.DOTALL | re.IGNORECASE)
        return match.group(1) if match else svg


image_service = ImageService()