# GMBTE Microservices — Market Research Service Context


**Status:** rate limiting and credit gating are fully wired in code but currently inert — `BYPASS_RATE_LIMITS=true`. Nothing blocks a request today; every gate below is dormant until that flag flips.

---

## Architecture — Three Gates, In Order

1. **Idempotency check** (Redis) — catches retries/double-clicks before anything else runs. Zero cost, zero side effects on a hit.
2. **Gate 1 — Entitlement** (static, no DB call) — does this plan tier include Research AI at all? `ENTITLED_PLANS = {founder_workspace, founder_pro, team}` — **Student is excluded**, this was a bug fix; the pricing doc puts Research AI under Founder Workspace+, not Student.
3. **Gate 3 — Burst rate limit** (Redis, fixed-window, per-minute + per-hour) — protects Tiingo/Tavily/Groq spend regardless of credit balance. **Fails open** if Redis is down — an outage shouldn't block legitimate requests.
4. **Gate 2 — Credit reserve** (main GMBTE Postgres DB, atomic `UPDATE ... WHERE balance >= cost RETURNING balance`) — the actual billing gate. **Fails closed** on DB errors — a credits-DB error blocks the request rather than granting a free run. This matters more here than in a synchronous service: because jobs are async, a fail-open bug wouldn't surface until a much later ledger reconciliation.

## Credit Lifecycle: Reserve → Commit → Refund

Credits are **reserved at intake**, before any work starts — not charged outright. This fits the async job model:

- **Cache hit** → cost = 1 credit (no external API spend) → reserved, then **committed immediately** since the result is already available.
- **Fresh fetch** → cost = 8 credits → reserved at intake, **committed only when the pipeline actually completes successfully**. If the job fails or times out and gets retried (via the timeout sweep, up to `job_max_retries`), the reservation stays open the whole time — no ambiguity about whether the user was charged.
- **Pipeline failure** → reservation is **refunded**.

Credit cost differentiation (cache vs fresh) only works because the result cache is **cross-user** — `query_normalized` is the cache key, not `query_normalized + user_id`. If User A searches "AAPL" and it's cached, User B searching "AAPL" pays the cheap cache-tier cost too, since no new API call happens. This is deliberate — do not scope the cache per-user.

## Job Participants — Handling Concurrent Joiners

A `ResearchJobParticipant` table tracks every user attached to a job — the original requester **and** anyone who joins an in-flight job for the same `query_normalized` while it's still processing. Each participant has their own `reference_id`, `cost`, `role` (`original`/`joined`), and `settled` flag.

When the pipeline finishes (success or failure), `_settle_participants()` loops over every unsettled row for that job and commits or refunds **each participant individually** — a joiner is never assumed to succeed or fail just because they attached to someone else's job; they're settled against the job's real outcome once it's known.

Migration: `alembic/versions/003_job_participants.py` — run `alembic upgrade head` after pulling this in.

---

## Frontend Trigger — The "Search / Generate" Button
1. **Generate an idempotency key** client-side — a fresh UUID, created at the moment of the click, not on page load. This is what lets the backend collapse double-clicks or network retries into a single charge (see the idempotency check above). If the frontend doesn't generate a new key per click, this protection does nothing.
2. **Send `POST /api/v1/research`** with the query text and `X-Idempotency-Key` header set to that UUID.
3. **Backend responds `202`** immediately with `{ job_id, credits }` — this is fast regardless of cache hit or fresh fetch, because the actual work happens in the background task, not inline in the request.
4. **Frontend updates the credit counter immediately** from the `credits` block in that response — this is the "single source of truth" contract; no separate fetch needed to reflect the new balance.
5. **Frontend starts polling** `GET /api/v1/research/{job_id}` — `AnalyzingPanel.jsx` is the loading-state component that should be showing during this window, polling until `status` flips to `complete` or `failed`.
6. **On `complete`** — `ResultsPanel.jsx`, `MarketChart.jsx`, and `NewsPanel.jsx` render from the job's `result`, `metrics`, `chart_data`, and `enrichments` fields.
7. **On `failed`** — the frontend should show a clear retry option. Because the backend refunds credits on pipeline failure, the user isn't charged for a failed run — worth reflecting that in the failure message itself (e.g. "No credits were charged — try again") rather than leaving them wondering.
---

## Environment Variables

```env
DATABASE_URL=postgresql+asyncpg://user:password@host:5432/dbname
DB_SCHEMA=market_research
CREDITS_DATABASE_URL=

REDIS_URL=rediss://...

GROQ_API_KEY=
GROQ_MODEL=llama-3.3-70b-versatile
TIINGO_API_KEY=
TAVILY_API_KEY=
NEWSAPI_KEY=
COINGECKO_API_KEY=

CACHE_TTL_CRYPTO=120
CACHE_TTL_STOCKS=300
CACHE_TTL_COMMODITY=300
CACHE_TTL_INDUSTRY=7200
CACHE_TTL_GENERAL=7200

JOB_PROCESSING_TIMEOUT_SECONDS=180
JOB_RESULT_EXPIRY_SECONDS=7200
JOB_INFLIGHT_LOCK_SECONDS=30
JOB_MAX_RETRIES=2

APP_ENV=production
ALLOWED_ORIGINS=

IDEMPOTENCY_KEY_TTL_SECONDS=120
RATE_LIMIT_PER_MINUTE=10
RATE_LIMIT_PER_HOUR=100

# Leave true until CREDITS_DATABASE_URL and plan-tier reconciliation are done
BYPASS_RATE_LIMITS=true
```

