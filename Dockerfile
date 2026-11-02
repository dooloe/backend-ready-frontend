FROM node:22-bookworm-slim AS frontend-build

ARG VITE_CUSTOMER_ORIGIN=http://127.0.0.1:8000
ARG VITE_ADMIN_ORIGIN=http://localhost:8000
ENV VITE_CUSTOMER_ORIGIN=${VITE_CUSTOMER_ORIGIN} \
    VITE_ADMIN_ORIGIN=${VITE_ADMIN_ORIGIN}

WORKDIR /build/frontend

COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

COPY frontend/ ./

# The browser and API share one origin in the final Python container.
ENV VITE_API_BASE_URL=
RUN npm run build


FROM python:3.12-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    FRONTEND_STATIC_DIR=/app/frontend

WORKDIR /app

COPY backend/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

RUN groupadd --system app \
    && useradd --system --gid app --home-dir /app app \
    && mkdir -p /app/data

COPY --chown=app:app backend/app/ ./app/
COPY --chown=app:app backend/migrations/ ./migrations/
COPY --chown=app:app backend/alembic.ini ./alembic.ini
COPY --chown=app:app backend/seed_directory.py ./seed_directory.py
COPY --chown=app:app backend/provision_production.py ./provision_production.py
COPY --from=frontend-build --chown=app:app /build/frontend/.output/public/ ./frontend/

RUN chown -R app:app /app
USER app

VOLUME ["/app/data"]
EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
