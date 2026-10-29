import { initialDemoHazards, DEMO_REFERENCE_TIME } from './demoHazards';

let failures = 0;
const PASS = (label: string) => console.log(`PASS  ${label}`);
const FAIL = (label: string, detail: string) => { console.error(`FAIL  ${label}: ${detail}`); failures++; };

// 1. No demo hazard may claim to be Verified
const verified = initialDemoHazards.filter(h => h.verification === 'Verified');
if (verified.length === 0) PASS('no demo hazard is Verified');
else FAIL('no demo hazard is Verified', `found: ${verified.map(h => h.id).join(', ')}`);

// 2. No demo source may reference an official body as if it were real
const officialPattern = /\bGMC\b|\bASDMA\b|\bTraffic Police\b/i;
const fakeOfficial = initialDemoHazards.filter(h => officialPattern.test(h.source));
if (fakeOfficial.length === 0) PASS('no demo hazard fakes an official source');
else FAIL('no demo hazard fakes an official source', `found: ${fakeOfficial.map(h => h.id).join(', ')}`);

// 3. All timestamps must use fixed DEMO_REFERENCE_TIME, not Date.now()
const baseMs = new Date(DEMO_REFERENCE_TIME).getTime();
const allTimestampsFixed = initialDemoHazards.every(h => {
  if (h.reportedAtMs === null) return true;
  return h.reportedAtMs <= baseMs;
});
if (allTimestampsFixed) PASS('all demo timestamps are fixed (not Date.now())');
else FAIL('all demo timestamps are fixed', 'some timestamps appear to use Date.now()');

// 4. At least one stale hazard exists (>48h old relative to DEMO_REFERENCE_TIME)
const staleThreshold = baseMs - 48 * 60 * 60_000;
const staleHazards = initialDemoHazards.filter(h => h.reportedAtMs !== null && h.reportedAtMs < staleThreshold);
if (staleHazards.length > 0) PASS(`at least 1 stale hazard exists (${staleHazards.length} found)`);
else FAIL('at least 1 stale hazard exists', 'none found');

const total = 4;
const passed = failures === 0 ? total : total - failures;
console.log(`\n${passed}/${total} demo data tests passed`);
if (failures > 0) throw new Error(`${failures} demo data test(s) failed`);
