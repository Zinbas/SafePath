import { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowDownUp,
  ArrowRight,
  ArrowUpRight,
  Bell,
  Check,
  CircleDot,
  Clock3,
  Compass,
  Crosshair,
  FileText,
  Flag,
  Gauge,
  Info,
  LocateFixed,
  MapPin,
  Menu,
  Plus,
  RefreshCw,
  Route as RouteIcon,
  Shield,
  Sparkles,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { CircleMarker, MapContainer, Popup, Polyline, TileLayer, useMap } from 'react-leaflet';
import type { LatLngExpression } from 'leaflet';
import { fetchRoadRoutes, geocodeAddress } from './services/routing';
import type { LocationCandidate } from './services/routing';
import {
  DuplicateHazardIdError,
  HazardValidationError,
  SEVERITY_LABELS,
  createHazardService,
  DEMO_HAZARDS,
} from './hazards';
import type { Hazard, HazardType, Severity } from './hazards';
import ExternalIncidents from './components/ExternalIncidents';
import { adaptHazardServiceRecords, assessRoutes } from './services/riskAssessment';
import { compareRoutes } from './riskEngine';
import type { RoutePreference } from './riskEngine';
import 'leaflet/dist/leaflet.css';
import './styles.css';

type Tab = 'planner' | 'reports' | 'methodology';

type Route = {
  id: string;
  name: string;
  shortName: string;
  subtitle: string;
  coordinates: [number, number][];
  distanceMeters: number;
  durationSeconds: number;
  color: string;
};

const originName = 'Guwahati Railway Station';
const destinationName = 'Assam Downtown University';
const guwahatiCenter: LatLngExpression = [26.158, 91.805];

const CORRIDOR_PRESETS: Record<string, { label: string; latitude: number; longitude: number }> = {
  'AT Road': { label: 'AT Road corridor (approximate)', latitude: 26.1465, longitude: 91.7988 },
  'GS Road': { label: 'GS Road / Zoo Tiniali (approximate)', latitude: 26.1555, longitude: 91.8276 },
  'Panbazar': { label: 'Panbazar approach (approximate)', latitude: 26.1525, longitude: 91.8084 },
};

const hazardService = createHazardService();

let seedPromise: Promise<void> | null = null;
async function ensureDemoSeeded(): Promise<void> {
  if (!seedPromise) {
    seedPromise = (async () => {
      for (const demo of DEMO_HAZARDS) {
        try {
          await hazardService.ingestHazard(demo);
        } catch (error) {
          if (error instanceof DuplicateHazardIdError) {
            // Already seeded (e.g. React StrictMode or multiple mounts), safe to ignore
          } else {
            console.error('Failed to seed demo hazard:', error);
          }
        }
      }
    })();
  }
  return seedPromise;
}

function formatFreshness(reportedAt: string): string {
  const diffMs = Math.max(0, Date.now() - new Date(reportedAt).getTime());
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.floor(hours / 24);
  return `${days} d ago`;
}

function getDisplayVerification(hazard: Hazard): 'Verified' | 'Needs review' {
  return hazard.verificationStatus === 'verified' ? 'Verified' : 'Needs review';
}

function getDisplaySource(hazard: Hazard): string {
  if (hazard.source === 'demo') {
    if (hazard.id === 'h-culvert') return 'GMC field notice · Ward 17 (demo)';
    if (hazard.id === 'h-lights') return 'Community report · 2 corroborating signals (demo)';
    if (hazard.id === 'h-market') return 'Demo traffic bulletin · 13:05 IST';
    return 'Demo data · simulated';
  }
  if (hazard.source === 'community') return 'Community report · submitted in demo';
  if (hazard.source === 'official') return 'Official field notice';
  if (hazard.source === 'news') return 'News report';
  return hazard.source;
}

function LeafletViewport({ mapZoom, recenterKey, route, waypoints }: { mapZoom: number; recenterKey: number; route: Route | null; waypoints: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    map.setZoom(Math.round(13 + (mapZoom - 1) * 5), { animate: true });
  }, [map, mapZoom]);
  useEffect(() => {
    if (!route) return;
    const positions = [...route.coordinates, ...waypoints].map(([longitude, latitude]) => [latitude, longitude] as [number, number]);
    map.fitBounds(positions, { padding: [28, 28], maxZoom: 15, animate: true });
  }, [map, recenterKey, route]);
  return null;
}

function formatDistance(distanceMeters: number) {
  return distanceMeters >= 1000 ? `${(distanceMeters / 1000).toFixed(1)} km` : `${Math.round(distanceMeters)} m`;
}

function formatDuration(durationSeconds: number) {
  const minutes = Math.max(1, Math.round(durationSeconds / 60));
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} hr ${minutes % 60} min`;
}

function App() {
  const [activeTab, setActiveTab] = useState<Tab>('planner');
  const [originText, setOriginText] = useState(originName);
  const [destinationText, setDestinationText] = useState(destinationName);
  const [originSelection, setOriginSelection] = useState<LocationCandidate | null>(null);
  const [destinationSelection, setDestinationSelection] = useState<LocationCandidate | null>(null);
  const [originResults, setOriginResults] = useState<LocationCandidate[]>([]);
  const [destinationResults, setDestinationResults] = useState<LocationCandidate[]>([]);
  const [searchingLocation, setSearchingLocation] = useState<'origin' | 'destination' | null>(null);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [snappedWaypoints, setSnappedWaypoints] = useState<[number, number][]>([]);
  const [activeRouteId, setActiveRouteId] = useState<string | null>(null);
  const [routePreference, setRoutePreference] = useState<RoutePreference>('balanced');
  const [routeState, setRouteState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [routeError, setRouteError] = useState('');
  const [inputError, setInputError] = useState('');
  const [hazards, setHazards] = useState<Hazard[]>([]);
  const [selectedHazardId, setSelectedHazardId] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    void ensureDemoSeeded().then(async () => {
      const list = await hazardService.getAllHazards();
      if (isMounted) {
        setHazards(list);
      }
    });
    return () => {
      isMounted = false;
    };
  }, []);
  const [showReport, setShowReport] = useState(false);
  const [toast, setToast] = useState('');
  const [mapZoom, setMapZoom] = useState(1);
  const [mapRecenterKey, setMapRecenterKey] = useState(0);
  const [mapLayers, setMapLayers] = useState({ route: true, evidence: true });
  const [mobileMenu, setMobileMenu] = useState(false);
  const originSearchController = useRef<AbortController | null>(null);
  const destinationSearchController = useRef<AbortController | null>(null);
  const routeController = useRef<AbortController | null>(null);

  const activeRoute = routes.find((route) => route.id === activeRouteId) ?? null;
  const selectedHazard = hazards.find((hazard) => hazard.id === selectedHazardId) ?? null;
  const showGuwahatiHazards = snappedWaypoints.length === 2
    && snappedWaypoints.every(([longitude, latitude]) => latitude >= 25.9 && latitude <= 26.4 && longitude >= 91.5 && longitude <= 92.1);
  const engineHazards = adaptHazardServiceRecords(hazards, showGuwahatiHazards);
  const routeRiskResults = assessRoutes(routes, engineHazards);
  const routeComparison = compareRoutes(routeRiskResults, routePreference);
  const activeRisk = routeRiskResults.find((result) => result.routeId === activeRouteId) ?? null;

  const notify = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(''), 2800);
  };

  const clearRoutes = () => {
    routeController.current?.abort();
    setRoutes([]);
    setSnappedWaypoints([]);
    setActiveRouteId(null);
    setRouteState('idle');
    setRouteError('');
  };

  const searchLocation = async (field: 'origin' | 'destination') => {
    const query = field === 'origin' ? originText : destinationText;
    if (!query.trim()) {
      setInputError(`Enter a ${field === 'origin' ? 'starting' : 'destination'} location first.`);
      return;
    }

    const controllerRef = field === 'origin' ? originSearchController : destinationSearchController;
    const setResults = field === 'origin' ? setOriginResults : setDestinationResults;
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setSearchingLocation(field);
    setInputError('');
    setRouteError('');
    try {
      const results = await geocodeAddress(query, controller.signal);
      setResults(results);
      if (results.length === 0) setInputError(`No matching ${field} locations found. Try a more specific search.`);
    } catch (error) {
      if (error instanceof Error && error.name !== 'AbortError') {
        setResults([]);
        setInputError(error.message);
      }
    } finally {
      if (controllerRef.current === controller) setSearchingLocation(null);
    }
  };

  const computeRoutes = async () => {
    if (!originText.trim() || !destinationText.trim()) {
      setInputError('Enter both a starting location and a destination.');
      clearRoutes();
      return;
    }
    if (!originSelection || !destinationSelection) {
      setInputError('Search for each location and select a matching result before routing.');
      clearRoutes();
      return;
    }

    routeController.current?.abort();
    const controller = new AbortController();
    routeController.current = controller;
    setRoutes([]);
    setSnappedWaypoints([]);
    setActiveRouteId(null);
    setRouteError('');
    setInputError('');
    setRouteState('loading');

    try {
      const result = await fetchRoadRoutes(originSelection, destinationSelection, controller.signal);
      const receivedRoutes = result.routes.map((route, index): Route => ({
        id: route.id,
        name: index === 0 ? 'Recommended road route' : `Alternative ${index}`,
        shortName: index === 0 ? 'Recommended' : `Alternative ${index}`,
        subtitle: 'OSRM driving route · estimated duration, no live traffic guarantee',
        coordinates: route.coordinates,
        distanceMeters: route.distanceMeters,
        durationSeconds: route.durationSeconds,
        color: ['#15803d', '#d97706', '#2563eb'][index % 3],
      }));
      const localCoverage = result.waypoints.length === 2
        && result.waypoints.every(([longitude, latitude]) => latitude >= 25.9 && latitude <= 26.4 && longitude >= 91.5 && longitude <= 92.1);
      const initialAssessments = assessRoutes(receivedRoutes, adaptHazardServiceRecords(hazards, localCoverage));
      const recommendation = compareRoutes(initialAssessments, routePreference).recommendedRouteId;
      setRoutes(receivedRoutes);
      setSnappedWaypoints(result.waypoints);
      setActiveRouteId(recommendation ?? receivedRoutes[0].id);
      setRouteState('ready');
      setMapRecenterKey((value) => value + 1);
    } catch (error) {
      if (error instanceof Error && error.name !== 'AbortError') {
        setRouteError(error.message || 'Unable to calculate this route. Check your connection and try again.');
        setRouteState('error');
      }
    }
  };

  const selectLocation = (field: 'origin' | 'destination', location: LocationCandidate) => {
    if (field === 'origin') {
      setOriginSelection(location);
      setOriginText(location.displayName);
      setOriginResults([]);
    } else {
      setDestinationSelection(location);
      setDestinationText(location.displayName);
      setDestinationResults([]);
    }
    setInputError('');
    clearRoutes();
  };

  const updateLocationText = (field: 'origin' | 'destination', value: string) => {
    if (field === 'origin') {
      originSearchController.current?.abort();
      setOriginText(value);
      setOriginSelection(null);
      setOriginResults([]);
    } else {
      destinationSearchController.current?.abort();
      setDestinationText(value);
      setDestinationSelection(null);
      setDestinationResults([]);
    }
    setSearchingLocation(null);
    setInputError('');
    clearRoutes();
  };

  const swapRouteInputs = () => {
    originSearchController.current?.abort();
    destinationSearchController.current?.abort();
    setOriginText(destinationText);
    setDestinationText(originText);
    setOriginSelection(destinationSelection);
    setDestinationSelection(originSelection);
    setOriginResults([]);
    setDestinationResults([]);
    setSearchingLocation(null);
    setInputError('');
    clearRoutes();
  };

  const submitHazard = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const type = String(form.get('type') || 'Road obstruction') as HazardType;
    const locationKey = String(form.get('location') || 'AT Road');
    const selectedLocation = CORRIDOR_PRESETS[locationKey] ?? CORRIDOR_PRESETS['AT Road'];
    const rawSeverity = String(form.get('severity') || 'Medium');
    const severityMap: Record<string, Severity> = { Low: 1, Medium: 2, High: 3, Severe: 4 };
    const severity = severityMap[rawSeverity] ?? 2;
    const description = String(form.get('description') || '').trim();

    try {
      const created = await hazardService.submitCommunityHazard({
        type,
        title: `${type} reported`,
        locationLabel: selectedLocation.label,
        description,
        latitude: selectedLocation.latitude,
        longitude: selectedLocation.longitude,
        severity,
      });
      const updatedList = await hazardService.getAllHazards();
      setHazards(updatedList);
      setSelectedHazardId(created.id);
      setShowReport(false);
      notify('Local report added. It is included in the prototype route estimate, not a safety guarantee.');
      formElement.reset();
    } catch (error) {
      if (error instanceof HazardValidationError) {
        const messages = error.issues.map((issue) => `${issue.field}: ${issue.message}`).join(', ');
        notify(`Submission invalid: ${messages}`);
      } else if (error instanceof Error) {
        notify(`Error: ${error.message}`);
      } else {
        notify('Unable to submit hazard report.');
      }
    }
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <div className="brand-mark"><Shield size={19} strokeWidth={2.4} /></div>
          <div>
            <div className="brand-name">Safe Route</div>
            <div className="brand-subtitle">Guwahati civic pilot</div>
          </div>
        </div>
        <nav className={`topnav ${mobileMenu ? 'is-open' : ''}`}>
          <button className={activeTab === 'planner' ? 'nav-link active' : 'nav-link'} onClick={() => { setActiveTab('planner'); setMobileMenu(false); }}><RouteIcon size={15} /> Route planner</button>
          <button className={activeTab === 'reports' ? 'nav-link active' : 'nav-link'} onClick={() => { setActiveTab('reports'); setMobileMenu(false); }}><Bell size={15} /> Recent reports <span className="nav-count">{hazards.length}</span></button>
          <button className={activeTab === 'methodology' ? 'nav-link active' : 'nav-link'} onClick={() => { setActiveTab('methodology'); setMobileMenu(false); }}><FileText size={15} /> About & methodology</button>
        </nav>
        <div className="topbar-actions">
          <div className="sync-badge"><span className="live-dot" /> Demo data · Guwahati</div>
          <button className="report-top-button" onClick={() => setShowReport(true)}><AlertTriangle size={15} /> Report hazard</button>
          <button className="mobile-menu-button" onClick={() => setMobileMenu((value) => !value)} aria-label="Toggle menu"><Menu size={18} /></button>
          <div className="profile-dot">SR</div>
        </div>
      </header>

      <main className="page-content">
        <section className="demo-banner">
          <div className="banner-copy"><Info size={16} /><span><strong>Prototype risk estimate:</strong> demo hazard pins use approximate map positions; this score is not a probability or a safety guarantee.</span></div>
          <div className="banner-meta">Routing <strong>OSRM driving</strong></div>
        </section>

        {activeTab === 'planner' && (
          <div className="workspace">
            <aside className="inspection-panel">
              <section className="panel-card route-search-card">
                <div className="panel-heading">
                  <div className="heading-with-icon"><span className="icon-box green"><Compass size={17} /></span><div><h1>Road route planner</h1><p>Search locations, choose results, compare routes</p></div></div>
                  <span className="version-chip">OSRM</span>
                </div>
                <div className="route-fields">
                  <label className="route-field"><CircleDot size={15} className="green-text" /><span><small>Origin</small><input aria-label="Origin location" value={originText} onChange={(event) => updateLocationText('origin', event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); void searchLocation('origin'); } }} /></span><button type="button" className="location-search-button" aria-label="Search origin locations" title="Search origin locations" disabled={searchingLocation === 'origin'} onClick={() => void searchLocation('origin')}><LocateFixed size={15} /></button></label>
                  <button className="swap-button" onClick={swapRouteInputs} aria-label="Swap origin and destination"><ArrowDownUp size={14} /></button>
                  <label className="route-field"><MapPin size={16} className="red-text" /><span><small>Destination</small><input aria-label="Destination location" value={destinationText} onChange={(event) => updateLocationText('destination', event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); void searchLocation('destination'); } }} /></span><button type="button" className="location-search-button" aria-label="Search destination locations" title="Search destination locations" disabled={searchingLocation === 'destination'} onClick={() => void searchLocation('destination')}><LocateFixed size={15} /></button></label>
                </div>
                {(searchingLocation || originResults.length > 0 || destinationResults.length > 0) && <div className="location-suggestions" aria-live="polite">
                  {searchingLocation && <div className="location-search-status">Searching {searchingLocation} locations…</div>}
                  {originResults.length > 0 && <div><div className="eyebrow">Choose origin</div>{originResults.map((location) => <button type="button" className="location-suggestion" key={location.id} onClick={() => selectLocation('origin', location)}>{location.displayName}</button>)}</div>}
                  {destinationResults.length > 0 && <div><div className="eyebrow">Choose destination</div>{destinationResults.map((location) => <button type="button" className="location-suggestion" key={location.id} onClick={() => selectLocation('destination', location)}>{location.displayName}</button>)}</div>}
                </div>}
                {originSelection && destinationSelection && <div className="selected-location-note"><Check size={13} /> Selected results confirmed</div>}
                <div className="location-attribution">Geocoding by <a href="https://nominatim.openstreetmap.org/" target="_blank" rel="noreferrer">Nominatim</a> · © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a></div>
                {inputError && <div className="routing-message error-message" role="alert">{inputError}</div>}
                <div className="action-row"><button className="primary-button" onClick={() => void computeRoutes()} disabled={routeState === 'loading' || searchingLocation !== null}>{routeState === 'loading' ? <><RefreshCw size={16} className="spin-icon" /> Finding road routes…</> : <><Sparkles size={16} /> Find road routes</>}</button><button className="icon-button" onClick={swapRouteInputs} title="Swap locations" aria-label="Swap locations"><ArrowDownUp size={16} /></button></div>
              </section>

              <section className="demo-walkthrough">
                <div className="walkthrough-heading"><span className="eyebrow">Route flow</span><Sparkles size={14} className="green-text" /></div>
                <div className="walkthrough-steps"><button onClick={() => void searchLocation('origin')}><span>1</span><strong>Search</strong><small>find origin</small></button><button onClick={() => void searchLocation('destination')}><span>2</span><strong>Select</strong><small>confirm place</small></button><button onClick={() => void computeRoutes()}><span>3</span><strong>Route</strong><small>compare roads</small></button></div>
              </section>

              <section className="routes-section">
                <div className="section-heading"><div><div className="heading-with-icon"><RouteIcon size={17} /><h2>Road routes <span className="muted">({routes.length})</span></h2></div><p>Ranked by travel time and estimated reported hazards</p></div><span className="freshness"><span className="live-dot" /> {routeState === 'ready' ? 'scored' : 'OSRM'}</span></div>
                {routes.length > 0 && <div className="preference-control" role="group" aria-label="Route ranking preference">
                  <span>Preference</span>
                  {(['quickest', 'balanced', 'lower-risk'] as const).map((preference) => <button key={preference} type="button" className={routePreference === preference ? 'active' : ''} aria-pressed={routePreference === preference} onClick={() => {
                    setRoutePreference(preference);
                    const recommended = compareRoutes(routeRiskResults, preference).recommendedRouteId;
                    if (recommended) setActiveRouteId(recommended);
                  }}>{preference === 'lower-risk' ? 'Lower risk' : preference[0]?.toUpperCase() + preference.slice(1)}</button>)}
                </div>}
                {routeState === 'loading' && <div className="routing-message" role="status">Requesting road routes from OSRM…</div>}
                {routeState === 'error' && <div className="routing-message error-message" role="alert">{routeError}</div>}
                {routeState === 'idle' && <div className="routing-message">Search for both locations, select a result for each, then request routes.</div>}
                {routeState === 'ready' && routes.length === 0 && <div className="routing-message">No road routes were returned. Adjust the locations and try again.</div>}
                <div className="route-card-list">
                  {routeComparison.ranked.map((rankedRoute, index) => {
                    const route = routes.find((candidate) => candidate.id === rankedRoute.routeId);
                    if (!route) return null;
                    const risk = rankedRoute.result;
                    const isActive = route.id === activeRouteId;
                    return <button key={route.id} className={`route-card ${isActive ? 'selected' : ''}`} onClick={() => { setActiveRouteId(route.id); setSelectedHazardId(null); }}>
                      <div className="route-card-top"><div><div className="route-title-row"><span className="route-index">0{rankedRoute.rank}</span><h3>{route.name}</h3>{rankedRoute.rank === 1 && routeComparison.recommendedRouteId && <span className="recommended-chip">Best match</span>}{rankedRoute.blocked && <span className="risk-chip danger">Reported closure</span>}</div><p>{route.subtitle}</p></div><ArrowUpRight size={17} className="muted" /></div>
                      <div className="metric-grid"><div><span className="metric-label">Distance</span><strong>{formatDistance(route.distanceMeters)}</strong></div><div><span className="metric-label">Estimated time</span><strong>{formatDuration(route.durationSeconds)}</strong></div><div><span className="metric-label">Road type</span><strong>Driving</strong></div></div>
                      <div className="route-risk-row"><span className={`risk-chip ${risk.category === 'High' || risk.category === 'Very High' ? 'danger' : risk.coverage.level !== 'adequate' ? 'caution' : 'good'}`}>{risk.displayLabel}</span><strong>{risk.assessment === 'assessed' ? `${risk.score}/100` : '—'}</strong></div>
                      {rankedRoute.criticalWarnings.length > 0 && <div className="route-warning-preview"><AlertTriangle size={13} /> {rankedRoute.criticalWarnings[0]?.message}</div>}
                      {isActive && <div className="selected-line"><Check size={13} /> Selected route · highlighted on map</div>}
                    </button>;
                  })}
                {routes.length > 0 && <div className="comparison-note">{routeComparison.notes.join(' ')}</div>}
                </div>
              </section>

              <section className="panel-card active-detail-card">
                {activeRoute ? <>
                  <div className="section-heading"><div><div className="eyebrow">Selected OSRM route</div><h2>{activeRoute.name}</h2></div><span className="status-label good">Driving</span></div>
                  <div className="detail-summary"><div><span className="metric-label">Estimated time</span><strong>{formatDuration(activeRoute.durationSeconds)}</strong><small>not live traffic</small></div><div><span className="metric-label">Distance</span><strong>{formatDistance(activeRoute.distanceMeters)}</strong><small>OSRM road geometry</small></div><div><span className="metric-label">Alternatives</span><strong>{routes.length}</strong><small>returned by OSRM</small></div></div>
                  {activeRisk && <section className="risk-detail" aria-label="Selected route hazard assessment">
                    <div className="risk-detail-heading"><div><div className="eyebrow">Estimated reported-hazard risk</div><h3>{activeRisk.displayLabel}</h3></div><span className={`risk-score ${activeRisk.category === 'High' || activeRisk.category === 'Very High' ? 'danger' : ''}`}>{activeRisk.assessment === 'assessed' ? `${activeRisk.score}/100` : 'Unknown'}</span></div>
                    <div className="coverage-note"><Info size={14} /><span>Data coverage: <strong>{activeRisk.coverage.level}</strong>. {activeRisk.coverage.note}</span></div>
                    {activeRisk.criticalWarnings.map((warning) => <div className="critical-warning" key={warning.hazardId}><AlertTriangle size={15} /><span>{warning.message}</span></div>)}
                    {activeRisk.blocked.isBlocked && <div className="critical-warning blocked-note"><Shield size={15} /><span>{activeRisk.blocked.reason}</span></div>}
                    <ul className="risk-explanations">{activeRisk.explanations.slice(0, 5).map((explanation, index) => <li key={`${index}-${explanation}`}>{explanation}</li>)}</ul>
                    <p className="risk-disclaimer">Relative prototype score only—not a probability of harm. Demo pins are approximate and the absence of reports does not mean a road is safe.</p>
                  </section>}
                </> : <div className="empty-route-detail"><div className="eyebrow">Route details</div><p>Select two locations and request road routes to see distance and estimated duration.</p></div>}
              </section>
            </aside>

            <section className="map-stage">
              <div className="map-toolbar"><div className="map-label"><span className="map-label-icon"><MapPin size={15} /></span><span><strong>Road map</strong><small>{activeRoute ? `${activeRoute.name} · OSRM driving` : 'Choose locations to view road routes'}</small></span></div><div className="map-actions"><button className="map-control" onClick={() => setMapZoom((value) => Math.min(1.25, value + 0.1))} title="Zoom in" aria-label="Zoom in"><ZoomIn size={16} /></button><button className="map-control" onClick={() => setMapZoom((value) => Math.max(0.85, value - 0.1))} title="Zoom out" aria-label="Zoom out"><ZoomOut size={16} /></button><button className="map-control" onClick={() => setMapRecenterKey((value) => value + 1)} title="Fit selected route" aria-label="Fit selected route" disabled={!activeRoute}><Crosshair size={16} /></button><button className={`map-control ${mapLayers.route ? 'active-control' : ''}`} onClick={() => setMapLayers((current) => ({ ...current, route: !current.route }))} title="Toggle road routes" aria-label="Toggle road routes"><RouteIcon size={16} /></button><button className={`map-control ${mapLayers.evidence ? 'active-control' : ''}`} onClick={() => setMapLayers((current) => ({ ...current, evidence: !current.evidence }))} title="Toggle demo hazard markers" aria-label="Toggle demo hazard markers"><AlertTriangle size={15} /></button></div></div>
              <div className="map-canvas-wrap leaflet-map-wrap">
                <MapContainer center={guwahatiCenter} zoom={13} zoomControl={false} scrollWheelZoom className="leaflet-map" aria-label="Interactive road route map">
                  <TileLayer attribution='Tiles &copy; Esri &middot; Data &copy; OpenStreetMap contributors' url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}" />
                  <LeafletViewport mapZoom={mapZoom} recenterKey={mapRecenterKey} route={activeRoute} waypoints={snappedWaypoints} />
                  {mapLayers.route && routes.map((route) => { const isActive = route.id === activeRouteId; return <Polyline key={route.id} positions={route.coordinates.map(([longitude, latitude]) => [latitude, longitude] as [number, number])} pathOptions={{ color: route.color, weight: isActive ? 6 : 4, opacity: isActive ? 0.96 : 0.68 }} eventHandlers={{ click: () => setActiveRouteId(route.id) }} />; })}
                  {snappedWaypoints.length > 0 && <>
                    <CircleMarker center={[snappedWaypoints[0][1], snappedWaypoints[0][0]]} radius={10} pathOptions={{ color: '#15803d', fillColor: '#ffffff', fillOpacity: 1, weight: 4 }}><Popup><strong>Origin</strong><br />{originSelection?.displayName}</Popup></CircleMarker>
                    <CircleMarker center={[snappedWaypoints[snappedWaypoints.length - 1][1], snappedWaypoints[snappedWaypoints.length - 1][0]]} radius={10} pathOptions={{ color: '#dc2626', fillColor: '#ffffff', fillOpacity: 1, weight: 4 }}><Popup><strong>Destination</strong><br />{destinationSelection?.displayName}</Popup></CircleMarker>
                  </>}
                  {mapLayers.evidence && showGuwahatiHazards && hazards.map((hazard) => <CircleMarker key={hazard.id} center={[hazard.latitude, hazard.longitude]} radius={selectedHazardId === hazard.id ? 10 : 8} pathOptions={{ color: '#ffffff', fillColor: hazard.severity >= 3 ? '#dc2626' : '#d97706', fillOpacity: 1, weight: 2 }} eventHandlers={{ click: () => setSelectedHazardId(hazard.id) }}><Popup><strong>{hazard.title ?? hazard.type}</strong><br />{hazard.locationLabel ?? 'Guwahati'}<br /><button className="map-popup-button" onClick={() => setSelectedHazardId(hazard.id)}>Inspect evidence</button></Popup></CircleMarker>)}
                </MapContainer>
                <div className="map-legend"><div><span className="legend-line green-line" /> selected route</div><div><span className="legend-line amber-line" /> alternative route</div><div><span className="legend-dot red-dot" /> route endpoints</div><div><span className="legend-dot" /> curated demo hazard</div></div>
                <div className="map-attribution">Roads by OSRM · ETAs are estimates, not live traffic predictions</div>
              </div>
              <div className="map-bottom-bar"><div className="map-bottom-status"><span className="status-icon"><Gauge size={15} /></span><span><strong>Routing source</strong><small>{routeState === 'ready' ? `OSRM driving · ${routes.length} route${routes.length === 1 ? '' : 's'} returned` : 'OSRM driving · public demo service'}</small></span></div><span className="map-source-disclaimer">Not for emergency navigation</span></div>
              {selectedHazard && <HazardDrawer hazard={selectedHazard} onClose={() => setSelectedHazardId(null)} />}
            </section>
          </div>
        )}

        {activeTab === 'reports' && <ReportsView hazards={hazards} onSelect={(id) => { setActiveTab('planner'); setSelectedHazardId(id); }} onReport={() => setShowReport(true)} />}
        {activeTab === 'methodology' && <MethodologyView />}
      </main>

      <footer className="site-footer"><div><Shield size={14} /> OSRM returns road-based driving routes. Estimated duration may not reflect live traffic and does not guarantee safety.</div><div>Geocoding: Nominatim · OpenStreetMap contributors</div></footer>

      {showReport && <ReportModal onClose={() => setShowReport(false)} onSubmit={submitHazard} />}
      {toast && <div className="toast"><Check size={15} /> {toast}</div>}
    </div>
  );
}

function HazardDrawer({ hazard, onClose }: { hazard: Hazard; onClose: () => void }) {
  const severityLabel = SEVERITY_LABELS[hazard.severity];
  const verificationLabel = getDisplayVerification(hazard);
  const freshnessLabel = formatFreshness(hazard.reportedAt);
  const sourceLabel = getDisplaySource(hazard);
  const locationLabel = hazard.locationLabel ?? 'Guwahati corridor';
  const title = hazard.title ?? `${hazard.type} reported`;

  return <aside className="hazard-drawer"><div className="drawer-top"><div className="heading-with-icon"><span className={`icon-box ${hazard.severity >= 3 ? 'red' : 'amber'}`}><AlertTriangle size={17} /></span><div><div className="eyebrow">Hazard evidence detail</div><h2>{title}</h2></div></div><button className="icon-button" onClick={onClose}><X size={16} /></button></div><div className="drawer-status-row"><span className={`status-label ${verificationLabel === 'Verified' ? 'good' : 'neutral'}`}>{verificationLabel}</span><span className="freshness-label"><Clock3 size={13} /> {freshnessLabel}</span></div><div className="drawer-grid"><div><span className="metric-label">Location</span><strong>{locationLabel}</strong></div><div><span className="metric-label">Severity</span><strong className={hazard.severity >= 3 ? 'red-text' : 'amber-text'}>{severityLabel}</strong></div><div><span className="metric-label">Source</span><strong>{sourceLabel}</strong></div></div><p className="drawer-summary">{hazard.description}</p><div className="uncertainty-box"><Info size={15} /><span>Locations are approximate where noted. The route score is a relative prototype estimate, not a safety guarantee.</span></div><div className="button-row"><button className="text-button" onClick={onClose}>Close <X size={13} /></button></div></aside>;
}

function ReportsView({ hazards, onSelect, onReport }: { hazards: Hazard[]; onSelect: (id: string) => void; onReport: () => void }) {
  const verifiedCount = hazards.filter((h) => h.verificationStatus === 'verified').length;
  const needsReviewCount = hazards.filter((h) => h.verificationStatus === 'unverified').length;

  return <div className="content-page"><div className="content-page-header"><div><div className="eyebrow">Evidence ledger · Guwahati pilot</div><h1>Recent hazard reports</h1><p>Local hazard evidence informs prototype route estimates; the separate external news feed is informational and does not affect ranking.</p></div><button className="primary-button" onClick={onReport}><Plus size={16} /> Report a hazard</button></div><div className="report-summary-strip"><div><strong>{hazards.length}</strong><span>tracked items</span></div><div><strong>{verifiedCount}</strong><span>verified signals</span></div><div><strong>{needsReviewCount}</strong><span>needs review</span></div><div><strong>Demo</strong><span>local session only</span></div></div><div className="report-list">{hazards.map((hazard) => {
    const severityLabel = SEVERITY_LABELS[hazard.severity];
    const verificationLabel = getDisplayVerification(hazard);
    const freshnessLabel = formatFreshness(hazard.reportedAt);
    const sourceLabel = getDisplaySource(hazard);
    const locationLabel = hazard.locationLabel ?? 'Guwahati corridor';
    const title = hazard.title ?? `${hazard.type} reported`;

    return <button className="report-row" key={hazard.id} onClick={() => onSelect(hazard.id)}><div className={`report-icon ${severityLabel === 'Severe' ? 'high' : severityLabel.toLowerCase()}`}><AlertTriangle size={17} /></div><div className="report-main"><div className="report-title-row"><h2>{title}</h2><span className={`status-label ${verificationLabel === 'Verified' ? 'good' : 'neutral'}`}>{verificationLabel}</span></div><p>{hazard.description}</p><div className="report-meta"><span><MapPin size={13} /> {locationLabel}</span><span><Clock3 size={13} /> {freshnessLabel}</span><span><FileText size={13} /> {sourceLabel}</span></div></div><div className="report-impact"><span className="metric-label">Evidence</span><strong>{severityLabel}</strong><ArrowRight size={15} /></div></button>;
  })}</div><ExternalIncidents /></div>;
}

function MethodologyView() {
  return <div className="content-page methodology-page"><div className="content-page-header"><div><div className="eyebrow">Routing sources</div><h1>About road routing</h1><p>Locations are resolved with user-triggered OpenStreetMap Nominatim searches. Selected coordinates are sent to OSRM for driving routes.</p></div><div className="method-badge"><RouteIcon size={17} /> OSRM driving</div></div><div className="method-grid"><section className="method-card"><div className="method-card-heading"><span className="number-badge">01</span><div><h2>Confirm locations</h2><p>Each entered address must be searched and a matching place selected before routing. Ambiguous text is never converted to an assumed coordinate.</p></div></div></section><section className="method-card"><div className="method-card-heading"><span className="number-badge">02</span><div><h2>Compare returned roads</h2><p>OSRM supplies route geometry, distance, and estimated duration. It may return fewer alternatives than requested.</p></div></div></section><section className="method-card"><div className="method-card-heading"><span className="number-badge">03</span><div><h2>Prototype hazard scoring</h2><p>Located local hazards are adapted into a relative estimate against OSRM route geometry. The current store is per-tab and community corridor pins are approximate; external news reports do not affect ranking.</p></div></div></section><section className="method-card wide limitation-card"><Info size={18} className="amber-text" /><div><h2>Important limitation</h2><p>Risk is a relative estimate, not a probability or safety guarantee. Demo positions and coverage are approximate; use a verified hazard service before relying on real-world recommendations. This prototype is not for emergency navigation.</p></div></section></div></div>;
}

function ReportModal({ onClose, onSubmit }: { onClose: () => void; onSubmit: (event: React.FormEvent<HTMLFormElement>) => void }) {
  return <div className="modal-scrim"><div className="modal-card"><div className="modal-heading"><div><div className="eyebrow">Community evidence · demo</div><h2>Report a hazard</h2><p>Local demo submissions affect prototype estimates using approximate map positions.</p></div><button className="icon-button" onClick={onClose}><X size={17} /></button></div><form onSubmit={onSubmit}><div className="form-grid"><label>Hazard type<select name="type" defaultValue="Road obstruction"><option>Road obstruction</option><option>Road closure</option><option>Low lighting</option><option>Flooding</option><option>Traffic incident</option></select></label><label>Severity<select name="severity" defaultValue="Medium"><option>Low</option><option>Medium</option><option>High</option><option>Severe</option></select></label><label>Nearby corridor<select name="location" defaultValue="AT Road"><option>AT Road</option><option>GS Road</option><option>Panbazar</option></select></label><label className="full-width">What did you observe?<textarea name="description" required minLength={10} placeholder="Describe the issue briefly, including what a traveller should look out for." /></label></div><div className="form-note"><Info size={14} /> Do not include personal information. This prototype stores the report only in the current demo session.</div><div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancel</button><button type="submit" className="primary-button"><Flag size={15} /> Submit report</button></div></form></div></div>;
}

export default App;
