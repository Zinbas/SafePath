import { readFileSync, writeFileSync } from 'node:fs';

let c = readFileSync('frontend/components/InteractiveMap.tsx', 'utf8');

// 1. Add onReportLocationClick to props interface
c = c.replace(
  "  onSelectHazard: (hazardId: string) => void;\n}",
  "  onSelectHazard: (hazardId: string) => void;\n  /** When set, map clicks also set the report location. */\n  onReportLocationClick?: (lat: number, lng: number) => void;\n}"
);

// 2. Add to destructuring
c = c.replace(
  "  onSelectHazard,\n}: InteractiveMapProps)",
  "  onSelectHazard,\n  onReportLocationClick,\n}: InteractiveMapProps)"
);

// 3. Add report location callback to handleMapClick
c = c.replace(
  "  const handleMapClick = async (e: LeafletMouseEvent) => {\n    const { lat, lng } = e.latlng;",
  "  const handleMapClick = async (e: LeafletMouseEvent) => {\n    const { lat, lng } = e.latlng;\n    // If the report form is open, also set the report location\n    onReportLocationClick?.(lat, lng);"
);

writeFileSync('frontend/components/InteractiveMap.tsx', c);
console.log('OK: added onReportLocationClick to InteractiveMap');

