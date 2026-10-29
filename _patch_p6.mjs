import { readFileSync, writeFileSync } from 'node:fs';

let c = readFileSync('frontend/App.tsx', 'utf8');

// 1. Add reportLocation state after showReport state
c = c.replace(
  "const [showReport, setShowReport] = useState(false);",
  `const [showReport, setShowReport] = useState(false);
  const [reportLocation, setReportLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [reportSaving, setReportSaving] = useState(false);`
);

// 2. Replace submitHazard function
const oldSubmitHazard = `  const submitHazard = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const type = String(form.get('type') || 'Road obstruction') as HazardType;
    const locationKey = String(form.get('location') || 'AT Road');
    const locationMap: Record<string, { label: string; point: MapPoint }> = {
      'AT Road': { label: 'AT Road corridor', point: { x: 15.7, y: 13.3 } },
      'GS Road': { label: 'GS Road / Zoo Tiniali', point: { x: 52.5, y: 30.7 } },
      'Panbazar': { label: 'Panbazar approach', point: { x: 13.5, y: 17.3 } },
      'Bhangagarh': { label: 'Guwahati-Shillong Road, Bhangagarh', point: { x: 43.8, y: 15.1 } },
      'Christian Basti': { label: 'GS Road, Christian Basti', point: { x: 62.8, y: 16.4 } },
      'Anil Nagar': { label: 'Anil Nagar connector road', point: { x: 36.9, y: 14.5 } },
      'Six Mile': { label: 'GS Road, Six Mile junction', point: { x: 66.2, y: 15.7 } },
    };
    const selectedLocation = locationMap[locationKey] ?? locationMap['AT Road'];
    const severity = String(form.get('severity') || 'Medium') as Hazard['severity'];
    const description = String(form.get('description') || 'User-submitted field report.');
    const newHazard: Hazard = {
      id: \`report-\${Date.now()}\`,
      type,
      title: \`\${type} reported\`,
      location: selectedLocation.label,
      point: selectedLocation.point,
      severity,
      verification: 'Needs review',
      freshness: 'just now',
      source: 'Community report · submitted in demo',
      summary: description,
      reportedAtMs: Date.now(),
    };
    setHazards((current) => [...current, newHazard]);
    setSelectedHazardId(newHazard.id);
    setShowReport(false);
    notify('Demo report added. Its approximate map position is included in this route estimate.');
    event.currentTarget.reset();
  };`;

const newSubmitHazard = `  const submitHazard = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!reportLocation) {
      notify('Click on the map first to set the hazard location.');
      return;
    }
    const form = new FormData(event.currentTarget);
    const type = String(form.get('type') || 'Road obstruction') as HazardType;
    const severity = String(form.get('severity') || 'Medium') as Hazard['severity'];
    const description = String(form.get('description') || 'User-submitted field report.');

    // Try to submit to backend API
    setReportSaving(true);
    try {
      const apiBase = (import.meta.env.VITE_API_BASE_URL as string) || '';
      const response = await fetch(\`\${apiBase}/api/reports\`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lat: reportLocation.lat,
          lng: reportLocation.lng,
          category: type,
          severity,
          description,
        }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error((body as Record<string, string>).error || \`Server returned \${response.status}\`);
      }
    } catch (err) {
      // Backend unavailable — fall through to local-only demo insert
      console.warn('Report API unavailable, adding locally:', err);
    } finally {
      setReportSaving(false);
    }

    // Always add to local state for immediate visibility
    const newHazard: Hazard = {
      id: \`report-\${Date.now()}\`,
      type,
      title: \`\${type} reported\`,
      location: \`Map pin (\${reportLocation.lat.toFixed(4)}, \${reportLocation.lng.toFixed(4)})\`,
      point: { x: 0, y: 0 },
      severity,
      verification: 'Needs review',
      freshness: 'just now',
      source: 'Community report · submitted in demo',
      summary: description,
      reportedAtMs: Date.now(),
    };
    setHazards((current) => [...current, newHazard]);
    setSelectedHazardId(newHazard.id);
    setShowReport(false);
    setReportLocation(null);
    notify('Report submitted. It will appear as an unverified community report.');
    event.currentTarget.reset();
  };`;

if (c.includes(oldSubmitHazard)) {
  c = c.replace(oldSubmitHazard, newSubmitHazard);
  console.log('OK: replaced submitHazard function');
} else {
  console.log('ERROR: could not find submitHazard function');
  // Debug
  const idx = c.indexOf('const submitHazard');
  console.log('submitHazard found at index', idx);
}

// 3. Replace the report form location dropdown with map-click instructions
const oldLocationSelect = `            <label>Nearby corridor
              <select name="location" defaultValue="AT Road">
                <option>AT Road</option>
                <option>GS Road</option>
                <option>Panbazar</option>
                <option>Bhangagarh</option>
                <option>Christian Basti</option>
                <option>Anil Nagar</option>
                <option>Six Mile</option>
              </select>
            </label>`;

const newLocationSelect = `            <label>Location
              <div style={{ padding: '8px 12px', background: 'var(--bg-surface)', borderRadius: '8px', fontSize: '12px' }}>
                {reportLocation ? (
                  <span style={{ color: 'var(--green)' }}>
                    <MapPin size={12} style={{ display: 'inline', marginRight: '4px' }} />
                    {reportLocation.lat.toFixed(4)}, {reportLocation.lng.toFixed(4)}
                  </span>
                ) : (
                  <span style={{ color: 'var(--amber)' }}>
                    <MapPin size={12} style={{ display: 'inline', marginRight: '4px' }} />
                    Click on the map to set the hazard location
                  </span>
                )}
              </div>
            </label>`;

if (c.includes(oldLocationSelect)) {
  c = c.replace(oldLocationSelect, newLocationSelect);
  console.log('OK: replaced location dropdown with map-click display');
} else {
  console.log('ERROR: could not find location select');
}

// 4. Update the form note to mention report saving state
const oldFormNote = `          <div className="form-note"><Info size={14} /> Do not include personal information. This prototype stores the report only in the current demo session.</div>`;
const newFormNote = `          <div className="form-note"><Info size={14} /> Do not include personal information. Reports are stored on the local API server when running, otherwise kept in the current demo session only.</div>`;

if (c.includes(oldFormNote)) {
  c = c.replace(oldFormNote, newFormNote);
  console.log('OK: updated form note');
}

// 5. Update submit button to show saving state
const oldSubmitBtn = `            <button type="submit" className="primary-button"><Flag size={15} /> Submit report</button>`;
const newSubmitBtn = `            <button type="submit" className="primary-button" disabled={reportSaving || !reportLocation}><Flag size={15} /> {reportSaving ? 'Saving…' : 'Submit report'}</button>`;

if (c.includes(oldSubmitBtn)) {
  c = c.replace(oldSubmitBtn, newSubmitBtn);
  console.log('OK: updated submit button');
}

writeFileSync('frontend/App.tsx', c);
console.log('Done patching App.tsx for P6');

