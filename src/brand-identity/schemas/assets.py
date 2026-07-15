from __future__ import annotations
from pydantic import BaseModel, Field, field_validator
from typing import Optional, List
from enum import Enum
import re


def _validate_hex(v):
    if v is None:
        return v
    v = v.strip()
    if not v.startswith("#"):
        v = f"#{v}"
    if not re.fullmatch(r"#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})", v):
        raise ValueError(f"Invalid hex colour: {v}")
    return v.upper()


class BrandColors(BaseModel):
    primary_color:   Optional[str] = Field(None, description="Primary brand colour hex e.g. #001F3F")
    secondary_color: Optional[str] = Field(None, description="Secondary brand colour hex e.g. #D7263D")

    @field_validator("primary_color", "secondary_color", mode="before")
    @classmethod
    def validate_hex_colors(cls, v):
        return _validate_hex(v)


class LogoStyle(str, Enum):
    WORDMARK         = "Wordmark"
    LETTERMARK       = "Lettermark"
    EMBLEM           = "Emblem"
    COMBINATION_MARK = "Combination Mark"

class LogoType(str, Enum):
    IMAGE_BASED = "image_based"
    TYPOGRAPHIC = "typographic"

class LogoInput(BrandColors):
    brand_name:  str           = Field(..., min_length=1, max_length=100)
    tagline:     Optional[str] = Field(None, max_length=150)
    industry:    str           = Field(..., min_length=1, max_length=100)
    logo_style:  LogoStyle
    logo_type:   LogoType
    brand_feel:  Optional[str] = Field(None, max_length=200)


class BusinessCardInput(BrandColors):
    full_name:              str           = Field(..., min_length=1, max_length=100)
    job_title:              str           = Field(..., min_length=1, max_length=100)
    company_name:           str           = Field(..., min_length=1, max_length=100)
    industry:               Optional[str] = Field(None, max_length=100)
    email:                  str           = Field(..., max_length=254)
    phone:                  str           = Field(..., max_length=30)
    website:                Optional[str] = Field(None, max_length=200)
    logo_url:               Optional[str] = Field(None)
    registration_number:    Optional[str] = Field(None, max_length=50, description="Company registration number (e.g. RC-123456)")
    templated_template_id:  Optional[str] = Field(None)


class LetterheadInput(BrandColors):
    company_name:           str           = Field(..., min_length=1, max_length=100)
    company_address:        str           = Field(..., min_length=1, max_length=300)
    email:                  str           = Field(..., max_length=254)
    phone:                  str           = Field(..., max_length=30)
    website:                Optional[str] = Field(None, max_length=200)
    tagline:                Optional[str] = Field(None, max_length=150)
    logo_url:               Optional[str] = Field(None)
    registration_number:    Optional[str] = Field(None, max_length=50)
    templated_template_id:  Optional[str] = Field(None)


class SocialLink(BaseModel):
    platform: str = Field(..., description="e.g. LinkedIn, Twitter")
    url:      str = Field(..., max_length=300)

class EmailSignatureInput(BrandColors):
    full_name:              str                        = Field(..., min_length=1, max_length=100)
    job_title:              str                        = Field(..., min_length=1, max_length=100)
    company:                str                        = Field(..., min_length=1, max_length=100)
    email:                  str                        = Field(..., max_length=254)
    phone:                  str                        = Field(..., max_length=30)
    logo_url:               Optional[str]              = Field(None)
    registration_number:    Optional[str]              = Field(None, max_length=50, description="Company registration number (e.g. RC-123456)")
    social_links:           Optional[List[SocialLink]] = Field(None)
    photo_url:              Optional[str]              = Field(None)
    banner_text:            Optional[str]              = Field(None, max_length=200)
    templated_template_id:  Optional[str]              = Field(None)
    social_link:            Optional[str]              = Field(None, max_length=300)


class CurrencyOption(str, Enum):
    NGN = "NGN ₦"
    USD = "USD $"
    GBP = "GBP £"
    EUR = "EUR €"
    ZAR = "ZAR R"

class PaymentMethod(BaseModel):
    label:          str           = Field(...)
    bank_name:      Optional[str] = Field(None)
    account_name:   Optional[str] = Field(None)
    account_number: Optional[str] = Field(None)
    details:        Optional[str] = Field(None)

class InvoiceInput(BrandColors):
    company_name:           str                           = Field(..., min_length=1, max_length=100)
    company_address:        str                           = Field(..., min_length=1, max_length=300)
    email:                  str                           = Field(..., max_length=254)
    phone:                  str                           = Field(..., max_length=30)
    currency:               CurrencyOption
    footer_note:            Optional[str]                 = Field(None, max_length=500)
    logo_url:               Optional[str]                 = Field(None)
    registration_number:    Optional[str]                 = Field(None, max_length=50, description="Company registration number (e.g. RC-123456)")
    website:                Optional[str]                 = Field(None, max_length=200)
    invoice_number_prefix:  str                           = Field("INV-", max_length=20)
    tax_rate:               float                         = Field(0.0, ge=0.0, le=100.0)
    discount:               Optional[float]               = Field(None, ge=0.0)
    payment_terms:          Optional[str]                 = Field(None, max_length=50)
    payment_methods:        Optional[List[PaymentMethod]] = Field(None)
    terms_and_conditions:   Optional[str]                 = Field(None, max_length=2000)
    social_links:           Optional[List[SocialLink]]    = Field(None)
    templated_template_id:  Optional[str]                 = Field(None)


class QuotationInput(BrandColors):
    company_name:           str              = Field(..., min_length=1, max_length=100)
    company_address:        str              = Field(..., min_length=1, max_length=300)
    email:                  str              = Field(..., max_length=254)
    quote_valid_for:        str              = Field(..., max_length=50)
    registration_number:    Optional[str]    = Field(None, max_length=50)
    payment_terms:          Optional[str]    = Field(None, max_length=500)
    logo_url:               Optional[str]    = Field(None)
    phone:                  Optional[str]    = Field(None, max_length=30)
    website:                Optional[str]    = Field(None, max_length=200)
    quote_number_prefix:    str              = Field("QT-", max_length=20)
    expiration_date:        Optional[str]    = Field(None, max_length=50)
    prepared_by:            Optional[str]    = Field(None, max_length=100)
    terms_and_conditions:   Optional[str]    = Field(None, max_length=2000)
    delivery_required:      Optional[bool]   = Field(None)
    packaging_required:     Optional[bool]   = Field(None)
    signature_section:      bool             = Field(True)
    currency:               CurrencyOption   = CurrencyOption.NGN
    templated_template_id:  Optional[str]    = Field(None)


class TeamMember(BaseModel):
    name:      str           = Field(..., max_length=100)
    title:     str           = Field(..., max_length=100)
    photo_url: Optional[str] = Field(None)

class CompanyProfileInput(BaseModel):
    company_name:         str                        = Field(..., min_length=1, max_length=100)
    industry:             str                        = Field(..., min_length=1, max_length=100)
    tagline:              Optional[str]              = Field(None, max_length=150)
    description:          str                        = Field(..., min_length=10, max_length=2000)
    mission_statement:    Optional[str]              = Field(None, max_length=500)
    key_services:         str                        = Field(..., min_length=5, max_length=1000)
    year_founded:         Optional[str]              = Field(None, max_length=4)
    location:             str                        = Field(..., min_length=1, max_length=200)
    registration_number:  Optional[str]              = Field(None, max_length=50, description="Company registration number (e.g. RC-123456)")
    company_stats:        Optional[dict]             = Field(None)
    primary_color:        Optional[str]              = Field(None)
    secondary_color:      Optional[str]              = Field(None)
    logo_url:             Optional[str]              = Field(None)
    cover_image_url:      Optional[str]              = Field(None)
    team_members:         Optional[List[TeamMember]] = Field(None)
    facility_image_urls:  Optional[List[str]]        = Field(None, max_length=3)
    portfolio_image_urls: Optional[List[str]]        = Field(None, max_length=3)

    @field_validator("primary_color", "secondary_color", mode="before")
    @classmethod
    def validate_hex_colors(cls, v):
        return _validate_hex(v)


class NaicsCode(BaseModel):
    code:        str = Field(..., max_length=10)
    description: str = Field(..., max_length=200)

class PastPerformance(BaseModel):
    client:      str           = Field(..., max_length=100)
    description: str           = Field(..., max_length=300)
    year:        Optional[str] = Field(None, max_length=4)

class CapabilityStatementInput(BaseModel):
    company_name:             str                             = Field(..., min_length=1, max_length=100)
    core_competencies:        str                             = Field(..., min_length=10, max_length=1000)
    past_clients:             Optional[str]                   = Field(None, max_length=1000)
    differentiator:           str                             = Field(..., min_length=10, max_length=1000)
    contact_info:             str                             = Field(..., min_length=5, max_length=200)
    registration_number:      Optional[str]                   = Field(None, max_length=50, description="Company registration number (e.g. RC-123456)")
    duns_number:              Optional[str]                   = Field(None, max_length=20)
    cage_code:                Optional[str]                   = Field(None, max_length=10)
    naics_codes:              Optional[List[NaicsCode]]       = Field(None)
    certifications:           Optional[List[str]]             = Field(None)
    past_performance:         Optional[List[PastPerformance]] = Field(None)
    primary_color:            Optional[str]                   = Field(None)
    secondary_color:          Optional[str]                   = Field(None)
    logo_url:                 Optional[str]                   = Field(None)
    operations_image_url:     Optional[str]                   = Field(None)
    certification_badge_urls: Optional[List[str]]             = Field(None, max_length=6)

    @field_validator("primary_color", "secondary_color", mode="before")
    @classmethod
    def validate_hex_colors(cls, v):
        return _validate_hex(v)


class BrandGuidelinesInput(BrandColors):
    brand_name:               str                = Field(..., min_length=1, max_length=100)
    industry:                 str                = Field(..., min_length=1, max_length=100)
    brand_mission:            str                = Field(..., min_length=10, max_length=1000)
    target_audience:          str                = Field(..., min_length=5, max_length=300)
    brand_personality:        str                = Field(..., min_length=5, max_length=300)
    preferred_fonts:          Optional[str]      = Field(None, max_length=200)
    registration_number:      Optional[str]      = Field(None, max_length=50, description="Company registration number (e.g. RC-123456)")
    logo_url:                 Optional[str]      = Field(None)
    logo_dark_url:            Optional[str]      = Field(None)
    logo_mono_url:            Optional[str]      = Field(None)
    logo_icon_url:            Optional[str]      = Field(None)
    brand_pattern_url:        Optional[str]      = Field(None)
    photography_example_urls: Optional[List[str]] = Field(None, max_length=3)
    logo_usage_do_url:        Optional[str]      = Field(None)
    logo_usage_dont_url:      Optional[str]      = Field(None)


class GenerateResponse(BaseModel):
    job_id:   str
    asset_id: str
    status:   str = "pending"
    message:  str = "Generation started. Poll /assets/{asset_id}/status for updates."

class AssetStatusResponse(BaseModel):
    asset_id:            str
    status:              str
    asset_type:          str
    pdf_url:             Optional[str] = None
    docx_url:            Optional[str] = None
    png_url:             Optional[str] = None
    svg_light_url:       Optional[str] = None
    svg_dark_url:        Optional[str] = None
    png_transparent_url: Optional[str] = None
    ai_content:          Optional[dict] = None
    error_message:       Optional[str] = None
    created_at:          Optional[str] = None

class AssetListItem(BaseModel):
    asset_id:   str
    asset_type: str
    status:     str
    version:    int
    created_at: str

class EditPreFillResponse(BaseModel):
    asset_id:        str
    asset_type:      str
    inputs_snapshot: dict
    version:         int

class TemplateListResponse(BaseModel):
    doc_type:  str
    templates: List[dict]