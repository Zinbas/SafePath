import { createServer } from 'node:http';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createGdeltAdapter } from './adapters/gdeltAdapter.ts';
import { createGoogleNewsAdapter } from './adapters/googleNewsAdapter.ts';
import { loadConfig } from './config.ts';
import { ingestIncidents } from './ingestIncidents.ts';
import type { IngestionResult } from './ingestIncidents.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const reportsFilePath = join(__dirname, 'data', 'community_reports.json');

const host = process.env.HAZARD_API_HOST ?? '127.0.0.1';
const configuredPort = Number(process.env.HAZARD_API_PORT ?? '3100');
const port = Number.isInteger(configuredPort) && configuredPort > 0 && configuredPort <= 65_535 ? configuredPort : 3100;

// CORS configuration
const allowedOriginsRaw = process.env.ALLOWED_ORIGINS ?? '';
const allowedOrigins = allowedOriginsRaw
  ? allowedOriginsRaw.split(',').map(o => o.trim()).filter(Boolean)
  : ['http://localhost:5173', 'http://127.0.0.1:5173'];

// Google News RSS is the primary live news source; GDELT is kept as a second
// (frequently rate-limited) source with a short timeout so it cannot stall the feed.
const adapters = [
  createGoogleNewsAdapter({ maxRecords: 30 }),
  createGdeltAdapter({ maxRecords: 50, timespan: '24h', timeoutMs: 5000 }),
];
const cacheDurationMs = 2 * 60_000;
let cachedResult: { result: IngestionResult; expiresAt: number } | null = null;
let refreshInProgress: Promise<IngestionResult> | null = null;

const weatherCacheDurationMs = 10 * 60_000;
const WEATHER_CACHE_LIMIT = 100;
const weatherCache = new Map<string, { body: WeatherSnapshot; expiresAt: number }>();

interface WeatherSnapshot {
  latitude: number;
  longitude: number;
  temperatureC: number | null;
  precipitationMm: number | null;
  rainMm: number | null;
  weatherCode: number | null;
  observedAt: string | null;
  timezone: string | null;
  retrievedAt: string;
}

// --- Community Reports In-Memory Store ---
interface CommunityReport {
  id: string;
  lat: number;
  lng: number;
  category: string;
  description: string;
  severity: string;
  origin: 'community';
  verificationStatus: 'unverified';
  createdAt: string;
}

const ALLOWED_CATEGORIES = [
  'Road obstruction', 'Road closure', 'Low lighting',
  'Pothole', 'Flooding', 'Traffic incident',
];
const GUWAHATI_BOUNDS = { minLat: 25.90, maxLat: 26.40, minLng: 91.45, maxLng: 92.20 };
const MAX_BODY_SIZE = 65_536; // 64 KB

function loadReportsFromFile(): CommunityReport[] {
  try {
    if (existsSync(reportsFilePath)) {
      const data = readFileSync(reportsFilePath, 'utf8');
      const parsed = JSON.parse(data);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (err) {
    console.warn('Failed to load reports from file:', err);
  }
  return [];
}

function saveReportsToFile(reports: CommunityReport[]) {
  try {
    writeFileSync(reportsFilePath, JSON.stringify(reports, null, 2), 'utf8');
  } catch (err) {
    console.warn('Failed to persist reports to file:', err);
  }
}

const communityReports: CommunityReport[] = loadReportsFromFile();

// --- Per-IP Rate Limiting ---
const ipRequestCounts = new Map<string, { count: number; windowStart: number }>();
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 30;

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = ipRequestCounts.get(ip);
  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    ipRequestCounts.set(ip, { count: 1, windowStart: now });
    return false;
  }
  entry.count++;
  return entry.count > RATE_LIMIT_MAX_REQUESTS;
}

// --- Helpers ---

function sendJson(response: import('node:http').ServerResponse, status: number, body: unknown) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  response.end(JSON.stringify(body));
}

function setCorsHeaders(request: import('node:http').IncomingMessage, response: import('node:http').ServerResponse) {
  const origin = request.headers.origin;
  if (origin && allowedOrigins.includes(origin)) {
    response.setHeader('Access-Control-Allow-Origin', origin);
    response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');
    response.setHeader('Access-Control-Max-Age', '3600');
  }
}

function readBody(request: import('node:http').IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    request.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_SIZE) {
        request.destroy();
        reject(new Error('Request body too large'));
      }
      chunks.push(chunk);
    });
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    request.on('error', reject);
  });
}

function getIncidents() {
  if (cachedResult && cachedResult.expiresAt > Date.now()) return Promise.resolve(cachedResult.result);
  if (refreshInProgress) return refreshInProgress;

  refreshInProgress = ingestIncidents(adapters, { config: loadConfig(process.env) })
    .then((result) => {
      if (result.sources.some((source) => source.status === 'ok')) {
        cachedResult = { result, expiresAt: Date.now() + cacheDurationMs };
      }
      return result;
    })
    .finally(() => {
      refreshInProgress = null;
    });

  return refreshInProgress;
}

function asFiniteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

async function getWeather(latitude: number, longitude: number): Promise<WeatherSnapshot> {
  const cacheKey = `${latitude.toFixed(3)},${longitude.toFixed(3)}`;
  const cached = weatherCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.body;

  const parameters = new URLSearchParams({
    latitude: latitude.toFixed(4),
    longitude: longitude.toFixed(4),
    current: 'temperature_2m,precipitation,rain,weather_code',
    timezone: 'Asia/Kolkata',
  });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const upstream = await fetch(`https://api.open-meteo.com/v1/forecast?${parameters}`, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!upstream.ok) throw new Error(`Open-Meteo returned HTTP ${upstream.status}.`);
    const payload: unknown = await upstream.json();
    if (typeof payload !== 'object' || payload === null) throw new Error('Open-Meteo returned an invalid body.');
    const record = payload as Record<string, unknown>;
    const current = typeof record.current === 'object' && record.current !== null
      ? record.current as Record<string, unknown>
      : {};

    const snapshot: WeatherSnapshot = {
      latitude,
      longitude,
      temperatureC: asFiniteNumber(current.temperature_2m),
      precipitationMm: asFiniteNumber(current.precipitation),
      rainMm: asFiniteNumber(current.rain),
      weatherCode: asFiniteNumber(current.weather_code),
      observedAt: typeof current.time === 'string' ? `${current.time}:00+05:30` : null,
      timezone: typeof record.timezone === 'string' ? record.timezone : null,
      retrievedAt: new Date().toISOString(),
    };

    // Bound weather cache size
    if (weatherCache.size >= WEATHER_CACHE_LIMIT) {
      const oldestKey = weatherCache.keys().next().value;
      if (oldestKey !== undefined) weatherCache.delete(oldestKey);
    }
    weatherCache.set(cacheKey, { body: snapshot, expiresAt: Date.now() + weatherCacheDurationMs });
    return snapshot;
  } finally {
    clearTimeout(timer);
  }
}

const server = createServer(async (request, response) => {
  setCorsHeaders(request, response);

  // Handle CORS preflight
  if (request.method === 'OPTIONS') {
    response.writeHead(204);
    response.end();
    return;
  }

  const clientIp = (request.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
    ?? request.socket.remoteAddress ?? 'unknown';

  const requestUrl = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);

  if (requestUrl.pathname === '/api/health' && request.method === 'GET') {
    sendJson(response, 200, { status: 'ok', reports: communityReports.length });
    return;
  }

  if (request.method === 'GET' && requestUrl.pathname === '/api/weather') {
    const latitude = Number(requestUrl.searchParams.get('lat'));
    const longitude = Number(requestUrl.searchParams.get('lon'));
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
      sendJson(response, 400, { error: 'Query parameters lat and lon must be valid coordinates.' });
      return;
    }
    try {
      sendJson(response, 200, await getWeather(latitude, longitude));
    } catch {
      sendJson(response, 503, { error: 'Live weather is temporarily unavailable.' });
    }
    return;
  }

  // --- Community Reports ---
  if (requestUrl.pathname === '/api/reports') {
    if (request.method === 'GET') {
      sendJson(response, 200, { reports: communityReports, count: communityReports.length });
      return;
    }

    if (request.method === 'POST') {
      if (isRateLimited(clientIp)) {
        sendJson(response, 429, { error: 'Too many requests. Try again in a minute.' });
        return;
      }

      let rawBody: string;
      try {
        rawBody = await readBody(request);
      } catch {
        sendJson(response, 413, { error: 'Request body too large (max 64 KB).' });
        return;
      }

      let body: unknown;
      try {
        body = JSON.parse(rawBody);
      } catch {
        sendJson(response, 400, { error: 'Invalid JSON body.' });
        return;
      }

      if (typeof body !== 'object' || body === null) {
        sendJson(response, 400, { error: 'Request body must be a JSON object.' });
        return;
      }

      const b = body as Record<string, unknown>;
      const lat = Number(b.lat);
      const lng = Number(b.lng);
      const category = String(b.category ?? '');
      const description = String(b.description ?? '');
      const severity = String(b.severity ?? 'Medium');

      const errors: string[] = [];
      if (!Number.isFinite(lat) || lat < GUWAHATI_BOUNDS.minLat || lat > GUWAHATI_BOUNDS.maxLat) {
        errors.push(`lat must be between ${GUWAHATI_BOUNDS.minLat} and ${GUWAHATI_BOUNDS.maxLat}`);
      }
      if (!Number.isFinite(lng) || lng < GUWAHATI_BOUNDS.minLng || lng > GUWAHATI_BOUNDS.maxLng) {
        errors.push(`lng must be between ${GUWAHATI_BOUNDS.minLng} and ${GUWAHATI_BOUNDS.maxLng}`);
      }
      if (!ALLOWED_CATEGORIES.includes(category)) {
        errors.push(`category must be one of: ${ALLOWED_CATEGORIES.join(', ')}`);
      }
      if (description.length < 5 || description.length > 500) {
        errors.push('description must be between 5 and 500 characters');
      }

      if (errors.length > 0) {
        sendJson(response, 400, { error: 'Validation failed.', details: errors });
        return;
      }

      const report: CommunityReport = {
        id: `report-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        lat,
        lng,
        category,
        description,
        severity,
        origin: 'community',
        verificationStatus: 'unverified',
        createdAt: new Date().toISOString(),
      };

      communityReports.push(report);
      saveReportsToFile(communityReports);
      sendJson(response, 201, { report });
      return;
    }

    response.setHeader('Allow', 'GET, POST');
    sendJson(response, 405, { error: 'Method not allowed.' });
    return;
  }

  // --- Incidents ---
  if (requestUrl.pathname === '/api/incidents') {
    if (request.method !== 'GET') {
      response.setHeader('Allow', 'GET');
      sendJson(response, 405, { error: 'Method not allowed.' });
      return;
    }

    try {
      const result = await getIncidents();
      const allSourcesFailed = result.sources.length > 0 && result.sources.every((source) => source.status === 'failed');
      sendJson(response, allSourcesFailed ? 503 : 200, result);
    } catch {
      sendJson(response, 503, { error: 'Incident source is temporarily unavailable.' });
    }
    return;
  }

  sendJson(response, 404, { error: 'Not found.' });
});

server.listen(port, host, () => {
  console.log(`Hazard ingestion API listening on http://${host}:${port}`);
});
