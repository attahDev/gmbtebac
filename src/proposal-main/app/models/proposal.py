import uuid
from datetime import datetime

from sqlalchemy import Column, String, Text, DateTime, Index
from sqlalchemy.dialects.postgresql import UUID, JSONB

from app.core.database import Base


class Proposal(Base):
    __tablename__ = "proposals"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(String(255), nullable=False, default="default", index=True)
    user_name = Column(String(255), nullable=True)
    title = Column(String(255), nullable=False)
    proposal_type = Column(String(100), nullable=False)
    client_name = Column(String(255), nullable=True)
    estimated_budget = Column(String(100), nullable=True)
    total_value = Column(String(100), nullable=True)
    raw_input = Column(Text, nullable=False)
    content = Column(JSONB, nullable=False)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
