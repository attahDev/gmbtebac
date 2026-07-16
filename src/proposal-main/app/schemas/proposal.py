from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class GenerateRequest(BaseModel):
    prompt: str = Field(..., min_length=10, max_length=5000)
    client_name: str = Field("", max_length=255)
    estimated_budget: str = Field("", max_length=100)


class ProposalContent(BaseModel):
    executive_summary: str
    project_overview: str
    scope_of_work: str
    qualifications: str
    timeline: str
    pricing: str
    terms_and_conditions: str
    agreement: str


class ProposalResponse(BaseModel):
    id: UUID
    title: str
    proposal_type: str
    user_name: str | None = None
    client_name: str | None = None
    estimated_budget: str | None = None
    total_value: str | None = None
    content: ProposalContent
    created_at: datetime

    class Config:
        from_attributes = True


class ProposalListItem(BaseModel):
    id: UUID
    title: str
    proposal_type: str
    client_name: str | None = None
    total_value: str | None = None
    created_at: datetime

    class Config:
        from_attributes = True


class ProposalUpdateRequest(BaseModel):
    title: str | None = None
    content: ProposalContent | None = None


class ProposalListResponse(BaseModel):
    total: int
    page: int
    limit: int
    proposals: list[ProposalListItem]
