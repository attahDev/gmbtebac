import logging
import re
from datetime import datetime
from pathlib import Path

from jinja2 import Environment, FileSystemLoader
from weasyprint import HTML, CSS

logger = logging.getLogger(__name__)

TEMPLATES_DIR = Path(__file__).parent.parent / "templates"
jinja_env = Environment(loader=FileSystemLoader(str(TEMPLATES_DIR)))


def _render_html(proposal, toc_page_numbers: dict | None = None) -> str:
    template = jinja_env.get_template("proposal.html")
    return template.render(
        title=proposal.title,
        proposal_type=proposal.proposal_type,
        proposal_id=str(proposal.id)[:8].upper(),
        date=datetime.utcnow().strftime("%d %B %Y"),
        content=_content_obj(proposal.content),
        toc_page_numbers=toc_page_numbers or {},
    )


def _extract_page_numbers(pdf_bytes: bytes) -> dict:
    page_numbers = {}
    text = pdf_bytes.decode("latin-1", errors="replace")

    page_obj_ids = []
    for m in re.finditer(r"(\d+)\s+0\s+obj\b", text):
        obj_id = m.group(1)
        window = text[m.start(): m.start() + 300]
        if "/Type /Page" in window and "/Type /Pages" not in window:
            page_obj_ids.append(obj_id)

    obj_to_page = {obj_id: i + 1 for i, obj_id in enumerate(page_obj_ids)}


    for m in re.finditer(r'\(section-(\d+)\)\s*\[(\d+)\s+0\s+R', text):
        section_num = m.group(1)
        obj_ref = m.group(2)
        page_num = obj_to_page.get(obj_ref)
        if page_num is not None:
            page_numbers[f"section-{section_num}"] = page_num

    return page_numbers


def generate_pdf(proposal) -> bytes:
    html_pass1 = _render_html(proposal, toc_page_numbers=None)
    pdf_pass1 = HTML(string=html_pass1).write_pdf()

   
    toc_page_numbers = _extract_page_numbers(pdf_pass1)
    logger.debug("TOC page numbers extracted: %s", toc_page_numbers)

    if not toc_page_numbers:
        logger.warning("Could not extract section page numbers; using pass-1 PDF.")
        return pdf_pass1

    html_pass2 = _render_html(proposal, toc_page_numbers=toc_page_numbers)
    pdf_pass2 = HTML(string=html_pass2).write_pdf()
    return pdf_pass2


class _ContentObj:
    def __init__(self, data: dict):
        for k, v in data.items():
            setattr(self, k, v)


def _content_obj(content_dict: dict) -> _ContentObj:
    return _ContentObj(content_dict)
