import re
import colorsys


class ColorService:

    def apply_light_variant(self, svg: str, primary: str, secondary: str) -> str:
        bg_rect = f'<rect width="100%" height="100%" fill="#FFFFFF"/>'
        return self._inject_after_svg_open(svg, bg_rect)

    def apply_dark_variant(self, svg: str, primary: str, secondary: str) -> str:
        dark_bg = "#0A0A0A"
        bg_rect = f'<rect width="100%" height="100%" fill="{dark_bg}"/>'
        modified = svg.replace('fill="#000000"', 'fill="#FFFFFF"')
        modified = modified.replace('fill="#001F3F"', 'fill="#FFFFFF"')
        modified = modified.replace("fill='#000000'", "fill='#FFFFFF'")
        return self._inject_after_svg_open(modified, bg_rect)

    def apply_transparent_variant(self, svg: str) -> str:
        cleaned = re.sub(
            r'<rect[^>]*fill=["\'](?:#[Ff]{3,6}|white|#[Ff][Ff][Ff][Ff][Ff][Ff])["\'][^/]*/?>',
            "",
            svg,
        )
        return cleaned

    def _inject_after_svg_open(self, svg: str, element: str) -> str:
        match = re.search(r"<svg[^>]*>", svg, re.IGNORECASE)
        if match:
            insert_pos = match.end()
            return svg[:insert_pos] + element + svg[insert_pos:]
        return svg

    def generate_palette(self, primary_hex: str) -> dict:
        r, g, b = self._hex_to_rgb(primary_hex)
        h, s, l = self._rgb_to_hsl(r, g, b)

        return {
            "primary": primary_hex.upper(),
            "secondary": self._hsl_to_hex(self._rotate_hue(h, 30), s, l),
            "complementary": self._hsl_to_hex(self._rotate_hue(h, 180), s, l),
            "light_tint": self._hsl_to_hex(h, max(s - 0.2, 0.1), min(l + 0.35, 0.92)),
            "dark_shade": self._hsl_to_hex(h, min(s + 0.1, 1.0), max(l - 0.25, 0.08)),
        }

    def _hex_to_rgb(self, hex_color: str) -> tuple[float, float, float]:
        hex_color = hex_color.lstrip("#")
        if len(hex_color) == 3:
            hex_color = "".join(c * 2 for c in hex_color)
        r = int(hex_color[0:2], 16) / 255
        g = int(hex_color[2:4], 16) / 255
        b = int(hex_color[4:6], 16) / 255
        return r, g, b

    def _rgb_to_hsl(self, r: float, g: float, b: float) -> tuple[float, float, float]:
        h, l, s = colorsys.rgb_to_hls(r, g, b)
        return h, s, l

    def _hsl_to_hex(self, h: float, s: float, l: float) -> str:
        r, g, b = colorsys.hls_to_rgb(h, l, s)
        return "#{:02X}{:02X}{:02X}".format(
            int(r * 255), int(g * 255), int(b * 255)
        )

    def _rotate_hue(self, h: float, degrees: float) -> float:
        return (h + degrees / 360) % 1.0

    def hex_to_rgb_tuple(self, hex_color: str) -> tuple[int, int, int]:
        r, g, b = self._hex_to_rgb(hex_color)
        return int(r * 255), int(g * 255), int(b * 255)


color_service = ColorService()