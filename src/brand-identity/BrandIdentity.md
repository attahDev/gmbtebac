# Brand Identity Service — Deployment

**Stack:** FastAPI · Neon · Upstash Redis · Supabase S3

---

## Schema — `generated_assets`

```python
class AssetType(str, enum.Enum):
    LOGO = "logo"
    BUSINESS_CARD = "business_card"
    LETTERHEAD = "letterhead"
    EMAIL_SIGNATURE = "email_signature"
    INVOICE = "invoice"
    QUOTATION = "quotation"
    # Not yet implemented:
    # COMPANY_PROFILE, CAPABILITY_STATEMENT, BRAND_GUIDELINES

class JobStatus(str, enum.Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    DONE = "done"
    FAILED = "failed"

class GeneratedAsset(Base):
    __tablename__ = "generated_assets"

    id               = Column(UUID, primary_key=True, default=uuid.uuid4)
    user_id          = Column(String, nullable=False, index=True)
    asset_type       = Column(Enum(AssetType), nullable=False)
    status           = Column(Enum(JobStatus), nullable=False, default=JobStatus.PENDING)
    inputs_snapshot  = Column(JSON, nullable=False, default=dict)
    ai_content       = Column(JSON, nullable=True)
    pdf_url          = Column(Text, nullable=True)
    docx_url         = Column(Text, nullable=True)
    png_url          = Column(Text, nullable=True)
    svg_light_url    = Column(Text, nullable=True)
    svg_dark_url     = Column(Text, nullable=True)
    png_transparent_url = Column(Text, nullable=True)
    job_id           = Column(String, nullable=True, unique=True, index=True)
    error_message    = Column(Text, nullable=True)
    parent_id        = Column(UUID, ForeignKey("generated_assets.id"), nullable=True)
    version          = Column(Integer, nullable=False, default=1)
    created_at       = Column(DateTime, default=datetime.utcnow)
    updated_at       = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
```

---

## .env

```env
GROQ_API_KEY=
RECRAFT_API_KEY=
TEMPLATED_API_KEY=

DATABASE_URL=postgresql+asyncpg://user:password@host/dbname?ssl=require
CREDITS_DATABASE_URL=        

REDIS_URL=

JWT_SECRET=                    
JWT_ALGORITHM=HS256

STORAGE_PROVIDER=s3
STORAGE_BUCKET=brand-identity-assets
STORAGE_ENDPOINT_URL=         
STORAGE_ACCESS_KEY=           
STORAGE_SECRET_KEY=
STORAGE_PUBLIC_URL=
STORAGE_REGION=us-east-1

ENVIRONMENT=development       
ALLOWED_ORIGINS=               

MAX_UPLOAD_SIZE_MB=5
SIGNED_URL_EXPIRY_SECONDS=3600
RATE_LIMIT_PER_MINUTE=5
RATE_LIMIT_PER_HOUR=20
BRAND_IDENTITY_CREDIT_COST=500 # was incorrectly 100 — pricing doc says 500
```

---

## Render

- **Type:** Web Service (worker runs in-process — no separate service needed)
- **Build:** `pip install -r requirements.txt`
- **Start:** `uvicorn main:app --host 0.0.0.0 --port $PORT`
- **Health:** `GET /health`
