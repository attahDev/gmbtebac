from pydantic import BaseModel, UUID4
from typing import Optional, Any, List
from datetime import datetime

from app.models.pitch_deck import InputType, DeckStatus, ThemeType
class QuickInput(BaseModel):
    title: str
    idea: str


class StructuredInput(BaseModel):
    title: str
    problem: str
    solution: str
    market: str
    business_model: str
    traction: Optional[str] = None
    team: str
    ask: str


class RawInput(BaseModel):
    title: str
    notes: str


class GenerateRequest(BaseModel):
    input_type: InputType
    data: dict
    theme: ThemeType = ThemeType.gmbte

class SlideImage(BaseModel):
    url: str                        
    alt: Optional[str] = None


class SlideEdit(BaseModel):
    slide_number: int
    title: Optional[str] = None     
    heading: Optional[str] = None
    subheading: Optional[str] = None
    bullets: Optional[List[str]] = None
    image: Optional[SlideImage] = None  

class ExportRequest(BaseModel):
    deck_id: str
    theme: ThemeType = ThemeType.gmbte
    company_name: Optional[str] = None
    tagline: Optional[str] = None
    slides: List[SlideEdit]         

class DeckResponse(BaseModel):
    id: UUID4
    user_id: str
    title: str
    input_type: InputType
    theme: ThemeType
    status: DeckStatus
    slides_json: Optional[Any] = None
    error_message: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True

class JobStatusResponse(BaseModel):
    job_id: str
    deck_id: Optional[str] = None
    status: DeckStatus
    message: Optional[str] = None

class HistoryResponse(BaseModel):
    decks: list[DeckResponse]
    total: int


class ThemePreview(BaseModel):
    id: str
    name: str
    description: str
    bg_color: str
    accent_color: str
    text_color: str


class ThemesResponse(BaseModel):
    themes: List[ThemePreview]
