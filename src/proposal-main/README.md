# Proposal Builder — Deployment Guide

**Stack:** FastAPI · Neon · Redis · Groq · WeasyPrint (PDF) · Node.js (DOCX)

> Dockerfile installs both Python and Node.js — DOCX generation runs via `scripts/gen_proposal_docx.js`

---

## Schema — `proposals`

```python
class Proposal(Base):
    __tablename__ = "proposals"

    id               = Column(UUID, primary_key=True, default=uuid.uuid4)
    user_id          = Column(String(255), nullable=False, default="default", index=True)
    user_name        = Column(String(255), nullable=True)
    title            = Column(String(255), nullable=False)
    proposal_type    = Column(String(100), nullable=False)
    client_name      = Column(String(255), nullable=True)
    estimated_budget = Column(String(100), nullable=True)
    total_value      = Column(String(100), nullable=True)
    raw_input        = Column(Text, nullable=False)
    content          = Column(JSONB, nullable=False)
    created_at       = Column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at       = Column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)
```

---

## .env

```env
GROQ_API_KEY=

DATABASE_URL=postgresql+asyncpg://user:password@host/dbname?ssl=require
CREDITS_DATABASE_URL=         

REDIS_URL=

JWT_SECRET=                    
JWT_ALGORITHM=HS256            

SERVICE_NAME=Proposal Builder AI
ENVIRONMENT=development        
ALLOWED_ORIGINS=               

RATE_LIMIT_PER_MINUTE=5
RATE_LIMIT_PER_HOUR=30
VITE_PROPOSAL_BUILDER_API_URL=
PROPOSAL_CREDIT_COST=1

```

---

### Pre-deploy checklist
- [ ] `ENVIRONMENT=production`
- [ ] `JWT_SECRET` set — empty value silently breaks all auth in production
- [ ] `ALLOWED_ORIGINS` set to frontend domains
- [ ] `REDIS_URL` uses `rediss://` for Upstash
- [ ] `DATABASE_URL` live before first deploy (Alembic runs on startup)
- [ ] `node_modules/` excluded via `.dockerignore` — npm install runs in Docker build
