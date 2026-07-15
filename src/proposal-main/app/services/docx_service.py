import json
import logging
import re
import subprocess
import tempfile
from datetime import datetime
from pathlib import Path

logger = logging.getLogger(__name__)

_SCRIPT = Path(__file__).parent.parent.parent / "scripts" / "gen_proposal_docx.js"


def generate_docx(proposal) -> bytes:
    payload = {
        "title": proposal.title,
        "proposal_type": proposal.proposal_type,
        "proposal_id": str(proposal.id)[:8].upper(),
        "date": datetime.utcnow().strftime("%d %B %Y"),
        "content": proposal.content if isinstance(proposal.content, dict) else dict(proposal.content),
    }

    with tempfile.TemporaryDirectory() as tmp:
        data_path   = Path(tmp) / "proposal_data.json"
        output_path = Path(tmp) / "proposal_output.docx"

        data_path.write_text(json.dumps(payload), encoding="utf-8")

        result = subprocess.run(
            ["node", str(_SCRIPT), str(data_path), str(output_path)],
            capture_output=True,
            text=True,
            timeout=30,
        )

        if result.returncode != 0:
            logger.error("DOCX script failed: %s", result.stderr)
            raise RuntimeError(f"DOCX generation failed: {result.stderr[:200]}")

        if not output_path.exists():
            raise RuntimeError("DOCX script ran but produced no output file.")

        return output_path.read_bytes()
