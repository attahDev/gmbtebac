#!/bin/sh
set -e

echo "Running database migrations..."
alembic stamp head 2>/dev/null || (psql $DATABASE_URL -c "DELETE FROM alembic_version;" && alembic upgrade head) || alembic upgrade head

echo "Starting server..."
exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}
