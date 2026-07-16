# Pitch Deck Generator — Deployment Guide

**Stack:** FastAPI · PostgreSQL (Neon) · Redis · Groq · python-pptx

## Schema — `pitch_decks`

```python
class InputType(str, enum.Enum):
    quick      = "quick"
    structured = "structured"
    raw        = "raw"

class DeckStatus(str, enum.Enum):
    pending    = "pending"
    processing = "processing"
    done       = "done"
    failed     = "failed"

class ThemeType(str, enum.Enum):
    dark      = "dark"
    light     = "light"
    corporate = "corporate"
    minimal   = "minimal"
    bold      = "bold"
    gmbte     = "gmbte"    # default

class PitchDeck(Base):
    __tablename__ = "pitch_decks"

    id            = Column(UUID, primary_key=True, default=uuid.uuid4)
    user_id       = Column(String, nullable=False, index=True)
    title         = Column(String, nullable=False)
    input_type    = Column(SAEnum(InputType), nullable=False)
    raw_input     = Column(Text, nullable=False)
    slides_json   = Column(JSONB, nullable=True)
    file_path     = Column(String, nullable=True)   # local path — ephemeral, see above
    theme         = Column(SAEnum(ThemeType), default=ThemeType.gmbte)
    status        = Column(SAEnum(DeckStatus), default=DeckStatus.pending)
    error_message = Column(Text, nullable=True)
    created_at    = Column(DateTime, default=datetime.utcnow)
    updated_at    = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
```

> Migrations run on startup via `entrypoint.sh`: `alembic upgrade head`

---

## .env

No backend `.env` in repo — create from scratch:

```env
GROQ_API_KEY=
UNSPLASH_ACCESS_KEY=          # optional — leave empty to skip

DATABASE_URL=postgresql://user:password@host/dbname?sslmode=require
# psycopg2 (sync driver) — do NOT add +asyncpg to this URL

CREDITS_DATABASE_URL=   
REDIS_URL=
JWT_SECRET=                  
JWT_ALGORITHM=HS256

ENVIRONMENT=development       # flip to production before deploying
ALLOWED_ORIGINS=              

MEDIA_DIR=media/decks
RATE_LIMIT_PER_MINUTE=3
RATE_LIMIT_PER_HOUR=20
PITCH_DECK_CREDIT_COST=1

ENTITLED_PLANS=["founder_workspace","founder_pro","team","enterprise"]
```

**Frontend `.env`:**
```env
VITE_PITCH_DECK_API_URL=https://your-deployed-service-url
```

---

## Running with Docker

```bash
docker build -t pitch-deck .

# run (fix entrypoint.sh port first)
docker run -p 8000:8000 --env-file .env pitch-deck

# or with docker compose
docker compose up --build
```

**Health check:** `GET /health`

---

## Pre-deploy checklist
- [ ] Fix `entrypoint.sh` — `--port ${PORT:-8000}`
- [ ] Pin `requirements.txt` versions
- [ ] `ENVIRONMENT=production`
- [ ] `JWT_SECRET` set — uses `python-jose` (other services use `PyJWT`, both work with HS256)
- [ ] `DATABASE_URL` does NOT include `+asyncpg` — sync psycopg2 driver
- [ ] `REDIS_URL` uses `rediss://` if provider requires TLS
- [ ] `VITE_PITCH_DECK_API_URL` updated in frontend `.env`
- [ ] Accept ephemeral storage or wire S3 before launch
