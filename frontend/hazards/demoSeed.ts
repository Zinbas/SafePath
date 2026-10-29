/**
 * Curated demo hazard seeds for the Guwahati pilot.
 *
 * NOTE: These records are purely simulated demo data for evaluation and testing.
 * They do not reflect real-time conditions or verified safety claims and must
 * never be presented as real current incidents.
 */

import type { TrustedHazardInput } from './types';

export const DEMO_HAZARDS: TrustedHazardInput[] = [
  {
    id: 'h-culvert',
    type: 'Road obstruction',
    title: 'Open drainage work',
    locationLabel: 'AT Road, near Bharalumukh junction',
    description:
      'Simulated demo data: A temporary pedestrian diversion is active beside an uncovered culvert. Vehicle lanes remain open. (Source: GMC field notice · Ward 17)',
    latitude: 26.1405,
    longitude: 91.7844,
    severity: 2,
    reportedAt: '2026-10-29T07:15:00.000Z',
    source: 'demo',
    verificationStatus: 'verified',
    locationConfidence: 'approximate',
  },
  {
    id: 'h-lights',
    type: 'Low lighting',
    title: 'Low-light segment',
    locationLabel: 'Zoo Road service lane',
    description:
      'Simulated demo data: Mapped lighting coverage is sparse across a 420 m service-lane segment. This is an evidence gap, not proof of unsafe conditions. (Source: Community report · 2 corroborating signals)',
    latitude: 26.1525,
    longitude: 91.8212,
    severity: 1,
    reportedAt: '2026-10-29T06:45:00.000Z',
    source: 'demo',
    verificationStatus: 'unverified',
    locationConfidence: 'approximate',
  },
  {
    id: 'h-market',
    type: 'Traffic incident',
    title: 'Market-hour traffic slowdown',
    locationLabel: 'Panbazar flyover approach',
    description:
      'Simulated demo data: An estimated 8–12 minute delay is reported near the flyover approach. This curated marker does not affect road routing. (Source: Demo traffic bulletin · 13:05 IST)',
    latitude: 26.1540,
    longitude: 91.8068,
    severity: 2,
    reportedAt: '2026-10-29T06:30:00.000Z',
    source: 'demo',
    verificationStatus: 'unverified',
    locationConfidence: 'approximate',
  },
];
