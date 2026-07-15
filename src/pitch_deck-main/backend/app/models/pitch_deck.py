import uuid
import enum
from datetime import datetime

from sqlalchemy import Column, String, Text, DateTime, Enum as SAEnum
from sqlalchemy.dialects.postgresql import UUID, JSONB

from app.database import Base


class InputType(str, enum.Enum):
    quick = "quick"
    structured = "structured"
    raw = "raw"


class DeckStatus(str, enum.Enum):
    pending = "pending"
    processing = "processing"
    done = "done"
    failed = "failed"


class ThemeType(str, enum.Enum):
    dark = "dark"
    light = "light"
    corporate = "corporate"
    minimal = "minimal"
    bold = "bold"
    gmbte = "gmbte"


class PitchDeck(Base):
    __tablename__ = "pitch_decks"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(String, nullable=False, index=True)
    title = Column(String, nullable=False)
    input_type = Column(SAEnum(InputType), nullable=False)
    raw_input = Column(Text, nullable=False)
    slides_json = Column(JSONB, nullable=True)
    file_path = Column(String, nullable=True)
    theme = Column(SAEnum(ThemeType), default=ThemeType.gmbte, nullable=False)
    status = Column(SAEnum(DeckStatus), default=DeckStatus.pending, nullable=False)
    error_message = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
