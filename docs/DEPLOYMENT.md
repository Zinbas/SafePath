# SafePath Deployment Guide

## Architecture Overview

SafePath comprises two decoupled tiers:

1. **Frontend**: React + Vite single-page application (SPA). Completely static assets (`HTML`, `JS`, `CSS`).
2. **Backend API**: Node.js microservice (`services/hazard-ingestion/server.ts`) providing:
   - External news hazard ingestion (`/api/incidents`)
   - Live weather proxy & caching (`/api/weather`)
   - Community hazard reports API with disk persistence (`/api/reports`)
   - Health check (`/api/health`)

---

## 1. Local Development

### Prerequisites
- Node.js >= 20.0.0
- npm >= 9.0.0

### Run Locally
```bash
# Terminal 1: Ingestion & Reports API (port 3100)
npm run dev:api

# Terminal 2: Frontend Vite dev server (port 5173 with proxy to 3100)
npm run dev
```

During local development, `vite.config.ts` proxies `/api/*` requests to `http://127.0.0.1:3100`.

---

## 2. Environment Variables

Reference template: [`.env.example`](../.env.example)

| Variable | Target | Description | Example |
|---|---|---|---|
| `VITE_API_BASE_URL` | Frontend | Base URL of deployed backend. Omit for relative path / proxy. | `https://safepath-api.onrender.com` |
| `VITE_CARTO_API_KEY` | Frontend | Optional CARTO basemap API key (falls back to Esri/OSM). | `a1b2c3...` |
| `HAZARD_API_HOST` | Backend | Host interface to bind server. | `0.0.0.0` or `127.0.0.1` |
| `HAZARD_API_PORT` | Backend | Port for Node API server. | `3100` or `$PORT` |
| `ALLOWED_ORIGINS` | Backend | Comma-separated CORS allowed origins. | `https://zinbas.github.io,http://localhost:5173` |

---

## 3. Production Deployment

### Frontend Tier (Static Hosting)

The frontend can be deployed to any static host (GitHub Pages, Cloudflare Pages, Vercel, Netlify, S3):

```bash
# Build production bundle
npm run build
```
Output directory: `dist/`

> [!IMPORTANT]
> **GitHub Pages Limitation**: GitHub Pages can host **only static files**. It cannot execute the Node.js API server (`server.ts`). If deploying to GitHub Pages, set `VITE_API_BASE_URL` to point to an external Node host (e.g. Render, Railway, Fly.io, or Cloud Run), and add your GitHub Pages origin to `ALLOWED_ORIGINS` on the backend.

### Backend Tier (Node.js Container or Serverless)

Deploy `services/hazard-ingestion/server.ts` to a Node-capable platform:

#### Example: Docker / Container
```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json tsconfig*.json ./
COPY services/ ./services/
COPY shared/ ./shared/
RUN npm ci --omit=dev
EXPOSE 3100
CMD ["npx", "tsx", "services/hazard-ingestion/server.ts"]
```

#### Example: Render / Railway / Fly.io
- **Build command**: `npm install`
- **Start command**: `npx tsx services/hazard-ingestion/server.ts`
- **Port**: Set `HAZARD_API_PORT` to `3100` (or leave default `$PORT`).

---

## 4. Security & Hardening Checklist

- [x] **CORS Enforcement**: Whitelisted origins via `ALLOWED_ORIGINS`. Preflight `OPTIONS` handled cleanly.
- [x] **Request Size Limits**: Max 64 KB on all incoming POST request bodies.
- [x] **Rate Limiting**: Per-client IP rate limiter (max 30 requests/min).
- [x] **Weather Cache Bounds**: Max 100 entries with 10-minute TTL to prevent memory leaks.
- [x] **HTTPS Enforcement**: `getApiBaseUrl()` alerts in production when connecting over unencrypted HTTP.
- [x] **Resilient Polling**: `useLiveIncidents` pauses when browser tab is hidden and uses exponential backoff (60s -> 120s -> 240s) on connection failures.
- [x] **Graceful Degradation**: If the backend API is unreachable, the frontend automatically falls back to local session-only demo mode with clear UI warnings.
