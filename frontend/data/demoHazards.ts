import type { Hazard } from '../types/hazard';

/** Synthetic local-only UI data; never treat these approximate pins as real reports. */
export const initialDemoHazards: Hazard[] = [
  {
    id: 'h-culvert',
    type: 'Road obstruction',
    title: 'Open drainage work',
    location: 'AT Road, near Bharalumukh junction',
    point: { x: 34, y: 43 },
    severity: 'Medium',
    verification: 'Verified',
    freshness: '18 min ago',
    source: 'GMC field notice · Ward 17',
    summary: 'A temporary pedestrian diversion is active beside an uncovered culvert. Vehicle lanes remain open.',
    reportedAtMs: Date.now() - 18 * 60_000,
  },
  {
    id: 'h-lights',
    type: 'Low lighting',
    title: 'Low-light segment',
    location: 'Zoo Road service lane',
    point: { x: 57, y: 35 },
    severity: 'Low',
    verification: 'Reported',
    freshness: '46 min ago',
    source: 'Community report · 2 corroborating signals',
    summary: 'Mapped lighting coverage is sparse across a 420 m service-lane segment. This is an evidence gap, not proof of unsafe conditions.',
    reportedAtMs: Date.now() - 46 * 60_000,
  },
  {
    id: 'h-market',
    type: 'Traffic incident',
    title: 'Market-hour traffic slowdown',
    location: 'Panbazar flyover approach',
    point: { x: 48, y: 34 },
    severity: 'Medium',
    verification: 'Reported',
    freshness: '1 hr ago',
    source: 'Demo traffic bulletin · 13:05 IST',
    summary: 'An estimated 8–12 minute delay is reported near the flyover approach.',
    reportedAtMs: Date.now() - 60 * 60_000,
  },
];
