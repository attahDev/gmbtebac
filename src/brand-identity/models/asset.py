import uuid
from datetime import datetime
from sqlalchemy import (
    Column, String, Text, DateTime, Enum as SAEnum,
    ForeignKey, JSON, Integer
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from core.database import Base
import enum


class AssetType(str, enum.Enum):
    LOGO = "logo"
    BUSINESS_CARD = "business_card"
    LETTERHEAD = "letterhead"
    EMAIL_SIGNATURE = "email_signature"
    INVOICE = "invoice"
    QUOTATION = "quotation"
    COMPANY_PROFILE = "company_profile"
    CAPABILITY_STATEMENT = "capability_statement"
    BRAND_GUIDELINES = "brand_guidelines"


class JobStatus(str, enum.Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    DONE = "done"
    FAILED = "failed"


class GeneratedAsset(Base):
    __tablename__ = "generated_assets"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(String(255), nullable=False, index=True)

    asset_type = Column(SAEnum(AssetType), nullable=False)

    inputs_snapshot = Column(JSON, nullable=False, default=dict)

    ai_content = Column(JSON, nullable=True)

    pdf_url = Column(Text, nullable=True)
    docx_url = Column(Text, nullable=True)
    png_url = Column(Text, nullable=True)              # business card, email sig
    svg_light_url = Column(Text, nullable=True)        # logo light variant
    svg_dark_url = Column(Text, nullable=True)         # logo dark variant
    png_transparent_url = Column(Text, nullable=True)  # logo transparent

    job_id = Column(String(255), nullable=True, unique=True, index=True)
    status = Column(SAEnum(JobStatus), nullable=False, default=JobStatus.PENDING)
    error_message = Column(Text, nullable=True)

    parent_id = Column(UUID(as_uuid=True), ForeignKey("generated_assets.id"), nullable=True)
    version = Column(Integer, nullable=False, default=1)

    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    children = relationship(
        "GeneratedAsset",
        back_populates="parent",
        foreign_keys=[parent_id],
    )
    parent = relationship(
        "GeneratedAsset",
        back_populates="children",
        foreign_keys=[parent_id],
        remote_side="GeneratedAsset.id",
    )