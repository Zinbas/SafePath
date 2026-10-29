import { createServer } from 'node:http';
import { createGdeltAdapter } from './adapters/gdeltAdapter.ts';
import { loadConfig } from './config.ts';
import { ingestIncidents } from './ingestIncidents.ts';
import type { IngestionResult } from './ingestIncidents.ts';

const host = process.env.HAZARD_API_HOST ?? '127.0.0.1';
const configuredPort = Number(process.env.HAZARD_API_PORT ?? '3100');
const port = Number.isInteger(configuredPort) && configuredPort > 0 && configuredPort <= 65_535 ? configuredPort : 3100;
const adapters = [createGdeltAdapter({ maxRecords: 50, timespan: '24h' })];
const cacheDurationMs = 5 * 60_000;
let cachedResult: { result: IngestionResult; expiresAt: number } | null = null;
let refreshInProgress: Promise<IngestionResult> | null = null;

function sendJson(response: import('node:http').ServerResponse, status: number, body: unknown) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  response.end(JSON.stringify(body));
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

const server = createServer(async (request, response) => {
  const requestUrl = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);

  if (requestUrl.pathname === '/api/health' && request.method === 'GET') {
    sendJson(response, 200, { status: 'ok' });
    return;
  }

  if (requestUrl.pathname !== '/api/incidents') {
    sendJson(response, 404, { error: 'Not found.' });
    return;
  }
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
});

server.listen(port, host, () => {
  console.log(`Hazard ingestion API listening on http://${host}:${port}`);
});