import { coordinateIssues } from './geo';
import { HazardValidationError } from './errors';
import type { ValidationIssue } from './errors';
import { HAZARD_SOURCES, HAZARD_TYPES, SEVERITY_LEVELS, VERIFICATION_STATUSES } from './types';
import type {
  CommunityHazardInput,
  Hazard,
  HazardSource,
  HazardType,
  LocationConfidence,
  Severity,
  StoredHazard,
  TrustedHazardInput,
  VerificationStatus,
} from './types';

export const MAX_ID_LENGTH = 128;
export const MAX_DESCRIPTION_LENGTH = 2000;
export const MAX_SHORT_TEXT_LENGTH = 200;
export const MAX_URL_LENGTH = 2048;
/** Report timestamps up to this far ahead of `now` are tolerated (clock skew); later ones are rejected. */
export const MAX_FUTURE_SKEW_MS = 5 * 60 * 1000;

type Raw = Record<string, unknown>;

const isRecord = (value: unknown): value is Raw => typeof value === 'object' && value !== null && !Array.isArray(value);

function oneOf<T extends string | number>(allowed: readonly T[], value: unknown): value is T {
  return (allowed as readonly unknown[]).includes(value);
}

function readText(raw: Raw, field: string, issues: ValidationIssue[], required: boolean, maxLength: number): string | undefined {
  const value = raw[field];
  if (value === undefined || value === null) {
    if (required) issues.push({ field, message: 'is required' });
    return undefined;
  }
  if (typeof value !== 'string') {
    issues.push({ field, message: 'must be a string' });
    return undefined;
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    if (required) issues.push({ field, message: 'must not be empty' });
    else issues.push({ field, message: 'must not be empty when provided' });
    return undefined;
  }
  if (trimmed.length > maxLength) {
    issues.push({ field, message: `must be at most ${maxLength} characters` });
    return undefined;
  }
  return trimmed;
}

const TIMESTAMP_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/;

/**
 * Parses a strict ISO 8601 date-time (with `Z` or numeric offset) and returns it normalised to UTC.
 * Returns `null` when invalid. Date-only strings and local (offset-less) times are rejected as ambiguous.
 */
export function normalizeTimestamp(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const match = TIMESTAMP_PATTERN.exec(value.trim());
  if (!match) return null;
  const [, y, mo, d, h, mi, s] = match;
  const year = Number(y);
  const month = Number(mo);
  const day = Number(d);
  if (month < 1 || month > 12 || day < 1) return null;
  if (day > new Date(Date.UTC(year, month, 0)).getUTCDate()) return null;
  if (Number(h) > 23 || Number(mi) > 59 || (s !== undefined && Number(s) > 59)) return null;
  const ms = Date.parse(value.trim());
  return Number.isNaN(ms) ? null : new Date(ms).toISOString();
}

function readTimestamp(raw: Raw, field: string, issues: ValidationIssue[], required: boolean, now: Date, rejectFuture: boolean): string | undefined {
  const value = raw[field];
  if (value === undefined || value === null) {
    if (required) issues.push({ field, message: 'is required' });
    return undefined;
  }
  const normalized = normalizeTimestamp(value);
  if (!normalized) {
    issues.push({ field, message: 'must be an ISO 8601 date-time with timezone, e.g. 2026-10-29T08:00:00Z' });
    return undefined;
  }
  if (rejectFuture && Date.parse(normalized) > now.getTime() + MAX_FUTURE_SKEW_MS) {
    issues.push({ field, message: 'must not be in the future' });
    return undefined;
  }
  return normalized;
}

function readEnum<T extends string | number>(raw: Raw, field: string, allowed: readonly T[], issues: ValidationIssue[], required: boolean): T | undefined {
  const value = raw[field];
  if (value === undefined || value === null) {
    if (required) issues.push({ field, message: 'is required' });
    return undefined;
  }
  if (!oneOf(allowed, value)) {
    issues.push({ field, message: `must be one of: ${allowed.join(', ')}` });
    return undefined;
  }
  return value;
}

function readUrl(raw: Raw, issues: ValidationIssue[]): string | undefined {
  const text = readText(raw, 'sourceUrl', issues, false, MAX_URL_LENGTH);
  if (text === undefined) return undefined;
  try {
    const url = new URL(text);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('protocol');
    return url.toString();
  } catch {
    issues.push({ field: 'sourceUrl', message: 'must be a valid http(s) URL' });
    return undefined;
  }
}

interface CommonFields {
  type?: HazardType;
  description?: string;
  severity?: Severity;
  title?: string;
  locationLabel?: string;
}

function readCommon(raw: Raw, issues: ValidationIssue[]): CommonFields {
  return {
    type: readEnum<HazardType>(raw, 'type', HAZARD_TYPES, issues, true),
    description: readText(raw, 'description', issues, true, MAX_DESCRIPTION_LENGTH),
    severity: readEnum<Severity>(raw, 'severity', SEVERITY_LEVELS, issues, true),
    title: readText(raw, 'title', issues, false, MAX_SHORT_TEXT_LENGTH),
    locationLabel: readText(raw, 'locationLabel', issues, false, MAX_SHORT_TEXT_LENGTH),
  };
}

function withOptionals<T extends object>(record: T, optionals: Record<string, string | undefined>): T {
  const out: Record<string, unknown> = { ...(record as Record<string, unknown>) };
  for (const [key, value] of Object.entries(optionals)) if (value !== undefined) out[key] = value;
  return out as T;
}

export interface CommunityContext {
  /** Service-assigned identifier. */
  id: string;
  now: Date;
}

/**
 * Validates an untrusted community submission and builds a `Hazard`.
 * Client-supplied `id`, `source`, `verificationStatus` and `reportedAt` are IGNORED:
 * source is always `community`, verification is always `unverified`, reportedAt is `ctx.now`.
 */
export function buildCommunityHazard(input: unknown, ctx: CommunityContext): Hazard {
  if (!isRecord(input)) throw new HazardValidationError([{ field: 'input', message: 'must be an object' }]);
  const issues: ValidationIssue[] = [];
  const common = readCommon(input, issues);
  const coordinateProblems = coordinateIssues(input.latitude, input.longitude);
  issues.push(...coordinateProblems);

  if (issues.length > 0 || common.type === undefined || common.description === undefined || common.severity === undefined) {
    throw new HazardValidationError(issues);
  }
  return withOptionals<Hazard>(
    {
      id: ctx.id,
      type: common.type,
      description: common.description,
      latitude: input.latitude as number,
      longitude: input.longitude as number,
      severity: common.severity,
      reportedAt: ctx.now.toISOString(),
      source: 'community',
      verificationStatus: 'unverified',
    },
    { title: common.title, locationLabel: common.locationLabel },
  );
}

/**
 * Validates a normalised record from a trusted producer. See `TrustedHazardInput` for rules.
 * Returns a `Hazard` when coordinates are present, or an `UnlocatedHazard` (null coordinates) when both are absent.
 */
export function buildTrustedHazard(input: unknown, ctx: { now: Date }): StoredHazard {
  if (!isRecord(input)) throw new HazardValidationError([{ field: 'input', message: 'must be an object' }]);
  const issues: ValidationIssue[] = [];

  const id = readText(input, 'id', issues, true, MAX_ID_LENGTH);
  const common = readCommon(input, issues);
  const source = readEnum<HazardSource>(input, 'source', HAZARD_SOURCES, issues, true);
  const requestedVerification = readEnum<VerificationStatus>(input, 'verificationStatus', VERIFICATION_STATUSES, issues, false);
  const reportedAt = readTimestamp(input, 'reportedAt', issues, true, ctx.now, true);
  const retrievedAt = readTimestamp(input, 'retrievedAt', issues, false, ctx.now, false);
  const sourceUrl = readUrl(input, issues);
  const confidence = readEnum<LocationConfidence>(input, 'locationConfidence', ['exact', 'approximate'], issues, false);

  const hasLat = input.latitude !== undefined && input.latitude !== null;
  const hasLon = input.longitude !== undefined && input.longitude !== null;
  const located = hasLat || hasLon;
  if (located) issues.push(...coordinateIssues(input.latitude, input.longitude));

  if (
    issues.length > 0
    || id === undefined || common.type === undefined || common.description === undefined
    || common.severity === undefined || source === undefined || reportedAt === undefined
  ) {
    throw new HazardValidationError(issues);
  }

  const verificationStatus: VerificationStatus = source === 'community' ? 'unverified' : (requestedVerification ?? 'unverified');
  const base = {
    id,
    type: common.type,
    description: common.description,
    severity: common.severity,
    reportedAt,
    source,
    verificationStatus,
  };
  const optionals = {
    title: common.title,
    locationLabel: common.locationLabel,
    sourceUrl,
    retrievedAt,
    locationConfidence: confidence,
  };

  if (located) {
    return withOptionals<Hazard>({ ...base, latitude: input.latitude as number, longitude: input.longitude as number }, optionals);
  }
  return withOptionals<StoredHazard>({ ...base, latitude: null, longitude: null }, optionals);
}

export type { CommunityHazardInput, TrustedHazardInput };
