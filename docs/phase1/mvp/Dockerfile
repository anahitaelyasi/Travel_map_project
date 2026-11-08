# One container serves both React's compiled files and the FastAPI backend.
FROM node:22-alpine AS frontend-build
WORKDIR /build/frontend
COPY frontend/package.json ./
RUN npm install --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

FROM python:3.12-slim
WORKDIR /srv
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 DATABASE_FILE=/data/nimrah.sqlite3 FRONTEND_DIST=/srv/frontend/dist
COPY backend/requirements.txt /srv/requirements.txt
RUN pip install --no-cache-dir -r /srv/requirements.txt && mkdir -p /data
COPY backend/app/ /srv/app/
COPY --from=frontend-build /build/frontend/dist/ /srv/frontend/dist/
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--forwarded-allow-ips", "127.0.0.1"]
