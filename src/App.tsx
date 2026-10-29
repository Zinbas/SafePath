import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDownUp,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Bell,
  Bike,
  Check,
  ChevronDown,
  CircleDot,
  Clock3,
  Compass,
  Crosshair,
  FileText,
  Flag,
  Gauge,
  Info,
  Layers3,
  Lightbulb,
  LocateFixed,
  MapPin,
  Menu,
  Navigation,
  Plus,
  RefreshCw,
  Route as RouteIcon,
  Shield,
  SlidersHorizontal,
  Sparkles,
  Target,
  TrafficCone,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import './styles.css';

type Point = { x: number; y: number };
type Tab = 'planner' | 'reports' | 'methodology';
type HazardType = 'Road obstruction' | 'Low lighting' | 'Flooding' | 'Traffic incident';
type Verification = 'Verified' | 'Reported' | 'Needs review';

type Hazard = {
  id: string;
  type: HazardType;
  title: string;
  location: string;
  point: Point;
  severity: 'High' | 'Medium' | 'Low';
  verification: Verification;
  freshness: string;
  ageMinutes: number;
  source: string;
  summary: string;
  routes: string[];
  scoreImpact: number;
  demo?: boolean;
};

type Route = {
  id: string;
  name: string;
  shortName: string;
  subtitle: string;
  points: Point[];
  distance: string;
  eta: string;
  walkEta: string;
  baseRisk: number;
  coverage: number;
  lighting: number;
  crossings: string;
  footfall: string;
  incidentIds: string[];
  color: string;
};

const origin = { name: 'Guwahati Railway Station', point: { x: 12, y: 51 } };
const destination = { name: 'Assam Downtown University', point: { x: 86, y: 17 } };
const gridCells = Array.from({ length: 20 }, (_, index) => ({
  id: `G-${String(index + 1).padStart(2, '0')}`,
  x: (index % 5) * 20,
  y: Math.floor(index / 5) * 14,
}));

const initialHazards: Hazard[] = [
  {
    id: 'h-culvert',
    type: 'Road obstruction',
    title: 'Open drainage work',
    location: 'AT Road, near Bharalumukh junction',
    point: { x: 34, y: 43 },
    severity: 'Medium',
    verification: 'Verified',
    freshness: '18 min ago',
    ageMinutes: 18,
    source: 'GMC field notice · Ward 17',
    summary: 'A temporary pedestrian diversion is active beside an uncovered culvert. Vehicle lanes remain open.',
    routes: ['route-a'],
    scoreImpact: 8,
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
    ageMinutes: 46,
    source: 'Community report · 2 corroborating signals',
    summary: 'Mapped lighting coverage is sparse across a 420 m service-lane segment. This is an evidence gap, not proof of unsafe conditions.',
    routes: ['route-b'],
    scoreImpact: 7,
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
    ageMinutes: 60,
    source: 'Demo traffic bulletin · 13:05 IST',
    summary: 'An estimated 8–12 minute delay is reported near the flyover approach. Route impact is time-weighted rather than safety-critical.',
    routes: ['route-c'],
    scoreImpact: 5,
    demo: true,
  },
];

const routes: Route[] = [
  {
    id: 'route-a',
    name: 'AT Road · Bharalumukh',
    shortName: 'AT Road corridor',
    subtitle: 'Best evidence coverage and stronger pedestrian continuity',
    points: [origin.point, { x: 22, y: 47 }, { x: 34, y: 43 }, { x: 46, y: 37 }, { x: 59, y: 32 }, { x: 70, y: 27 }, destination.point],
    distance: '10.8 km',
    eta: '29 min',
    walkEta: '2 hr 18 min',
    baseRisk: 18,
    coverage: 86,
    lighting: 82,
    crossings: '14 mapped',
    footfall: 'High',
    incidentIds: ['h-culvert'],
    color: '#15803d',
  },
  {
    id: 'route-b',
    name: 'GS Road · Zoo Tiniali',
    shortName: 'GS Road alternative',
    subtitle: 'Faster vehicle movement with one low-light evidence gap',
    points: [origin.point, { x: 20, y: 55 }, { x: 35, y: 55 }, { x: 48, y: 47 }, { x: 57, y: 35 }, { x: 70, y: 24 }, destination.point],
    distance: '9.6 km',
    eta: '25 min',
    walkEta: '2 hr 04 min',
    baseRisk: 25,
    coverage: 70,
    lighting: 68,
    crossings: '9 mapped',
    footfall: 'Medium',
    incidentIds: ['h-lights'],
    color: '#d97706',
  },
  {
    id: 'route-c',
    name: 'Paltan Bazaar · Panbazar',
    shortName: 'Central city route',
    subtitle: 'Most direct central alignment, with heavier traffic variance',
    points: [origin.point, { x: 27, y: 52 }, { x: 40, y: 48 }, { x: 48, y: 34 }, { x: 59, y: 24 }, { x: 74, y: 20 }, destination.point],
    distance: '10.1 km',
    eta: '27 min',
    walkEta: '2 hr 09 min',
    baseRisk: 29,
    coverage: 78,
    lighting: 75,
    crossings: '11 mapped',
    footfall: 'High',
    incidentIds: ['h-market'],
    color: '#b45309',
  },
];

function riskLabel(score: number) {
  if (score <= 24) return { label: 'Lower estimate', tone: 'good' };
  if (score <= 38) return { label: 'Moderate estimate', tone: 'warn' };
  return { label: 'Elevated estimate', tone: 'danger' };
}

function formatNow() {
  return new Intl.DateTimeFormat('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date());
}

function scoreRoute(route: Route, hazards: Hazard[], filters: { lighting: boolean; obstacles: boolean; pedestrian: boolean }) {
  const routeHazards = hazards.filter((hazard) => route.incidentIds.includes(hazard.id) || hazard.routes.includes(route.id));
  let score = route.baseRisk;
  const factors = [
    { key: 'lighting', label: 'Mapped lighting continuity', value: filters.lighting ? Math.round((100 - route.lighting) * 0.18) : 0, note: `${route.lighting}% coverage` },
    { key: 'hazards', label: 'Active route evidence', value: filters.obstacles ? routeHazards.reduce((sum, hazard) => sum + hazard.scoreImpact, 0) : 0, note: `${routeHazards.length} nearby item${routeHazards.length === 1 ? '' : 's'}` },
    { key: 'pedestrian', label: 'Pedestrian continuity', value: filters.pedestrian ? (route.crossings.startsWith('9') ? 4 : 2) : 0, note: `${route.crossings} crossings` },
  ];
  score += factors.reduce((sum, factor) => sum + factor.value, 0);
  const coverage = Math.min(98, route.coverage + Math.min(10, routeHazards.length * 4));
  return { score: Math.min(95, score), factors, routeHazards, coverage };
}

function App() {
  const [activeTab, setActiveTab] = useState<Tab>('planner');
  const [originText, setOriginText] = useState(origin.name);
  const [destinationText, setDestinationText] = useState(destination.name);
  const [activeRouteId, setActiveRouteId] = useState('route-a');
  const [hazards, setHazards] = useState(initialHazards);
  const [filters, setFilters] = useState({ lighting: true, obstacles: true, pedestrian: false });
  const [computedAt, setComputedAt] = useState('just now');
  const [selectedHazardId, setSelectedHazardId] = useState<string | null>(null);
  const [showReport, setShowReport] = useState(false);
  const [showNav, setShowNav] = useState(false);
  const [navStep, setNavStep] = useState(0);
  const [toast, setToast] = useState('');
  const [mapZoom, setMapZoom] = useState(1);
  const [mapLayers, setMapLayers] = useState({ route: true, risk: true, evidence: true });
  const [showGrid, setShowGrid] = useState(true);
  const [mobileMenu, setMobileMenu] = useState(false);

  const activeRoute = routes.find((route) => route.id === activeRouteId) ?? routes[0];
  const scoredRoutes = useMemo(() => routes.map((route) => ({ route, assessment: scoreRoute(route, hazards, filters) })), [hazards, filters]);
  const activeAssessment = scoredRoutes.find((item) => item.route.id === activeRoute.id)?.assessment ?? scoreRoute(activeRoute, hazards, filters);
  const selectedHazard = hazards.find((hazard) => hazard.id === selectedHazardId) ?? null;
  const routeHazards = hazards.filter((hazard) => hazard.routes.includes(activeRoute.id));
  const renderedGridCells = showGrid ? gridCells.map((cell) => {
    const cellHazards = hazards.filter((hazard) => hazard.point.x >= cell.x && hazard.point.x < cell.x + 20 && hazard.point.y >= cell.y && hazard.point.y < cell.y + 14);
    return <g key={cell.id} className="grid-overlay"><rect x={cell.x} y={cell.y} width="20" height="14" fill={cellHazards.length ? '#f59e0b' : 'transparent'} opacity={cellHazards.length ? '.08' : '.02'} /><text x={cell.x + 1.2} y={cell.y + 2.5}>{cell.id}{cellHazards.length ? ` · ${cellHazards.length}` : ''}</text></g>;
  }) : null;
  const navSteps = [
    `Exit Guwahati Railway Station toward Paltan Bazaar`,
    `Continue via ${activeRoute.shortName} for 4.2 km`,
    `Keep to the marked pedestrian edge near the next evidence point`,
    `Arrive at Assam Downtown University main gate`,
  ];

  const notify = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(''), 2800);
  };

  const computeRoutes = () => {
    setComputedAt(formatNow());
    notify('Route engine refreshed with current demo evidence.');
  };

  const swapRouteInputs = () => {
    setOriginText(destinationText);
    setDestinationText(originText);
    notify('Origin and destination swapped for a reverse-trip preview.');
  };

  const resetDemo = () => {
    setHazards(initialHazards);
    setActiveRouteId('route-a');
    setFilters({ lighting: true, obstacles: true, pedestrian: false });
    setComputedAt('just now');
    setShowNav(false);
    notify('Demo state reset to the baseline Guwahati pilot.');
  };

  const submitHazard = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const type = String(form.get('type') || 'Road obstruction') as HazardType;
    const locationKey = String(form.get('location') || 'AT Road');
    const locationMap: Record<string, { label: string; point: Point; routes: string[] }> = {
      'AT Road': { label: 'AT Road corridor', point: { x: 43, y: 39 }, routes: ['route-a', 'route-c'] },
      'GS Road': { label: 'GS Road / Zoo Tiniali', point: { x: 61, y: 33 }, routes: ['route-b'] },
      'Panbazar': { label: 'Panbazar approach', point: { x: 49, y: 35 }, routes: ['route-c'] },
    };
    const selectedLocation = locationMap[locationKey] ?? locationMap['AT Road'];
    const severity = String(form.get('severity') || 'Medium') as Hazard['severity'];
    const description = String(form.get('description') || 'User-submitted field report.');
    const impactBySeverity = { High: 14, Medium: 9, Low: 5 };
    const newHazard: Hazard = {
      id: `report-${Date.now()}`,
      type,
      title: `${type} reported`,
      location: selectedLocation.label,
      point: selectedLocation.point,
      severity,
      verification: 'Needs review',
      freshness: 'just now',
      ageMinutes: 0,
      source: 'Community report · submitted in demo',
      summary: description,
      routes: selectedLocation.routes,
      scoreImpact: impactBySeverity[severity],
    };
    setHazards((current) => [...current, newHazard]);
    setSelectedHazardId(newHazard.id);
    setShowReport(false);
    setComputedAt('live update');
    setActiveRouteId(selectedLocation.routes.includes(activeRoute.id) ? activeRoute.id : selectedLocation.routes[0]);
    notify('Report added. Active route assessment updated without a refresh.');
    event.currentTarget.reset();
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
          <div className="banner-copy"><Info size={16} /><span><strong>Demo prototype mode:</strong> route geometry and infrastructure signals are curated for this Guwahati trip. Risk values are experimental estimates, not guarantees.</span></div>
          <div className="banner-meta">Last engine check <strong>{computedAt}</strong> <span>•</span> <span className="green-text">local deterministic model</span></div>
        </section>

        {activeTab === 'planner' && (
          <div className="workspace">
            <aside className="inspection-panel">
              <section className="panel-card route-search-card">
                <div className="panel-heading">
                  <div className="heading-with-icon"><span className="icon-box green"><Compass size={17} /></span><div><h1>Guwahati route navigator</h1><p>One journey, three evidence-aware options</p></div></div>
                  <span className="version-chip">MVP 0.9</span>
                </div>
                <div className="route-fields">
                  <label className="route-field"><CircleDot size={15} className="green-text" /><span><small>Origin</small><input value={originText} onChange={(event) => setOriginText(event.target.value)} /></span><LocateFixed size={15} className="muted" /></label>
                  <button className="swap-button" onClick={swapRouteInputs} aria-label="Swap origin and destination"><ArrowDownUp size={14} /></button>
                  <label className="route-field"><MapPin size={16} className="red-text" /><span><small>Destination</small><input value={destinationText} onChange={(event) => setDestinationText(event.target.value)} /></span><X size={14} className="muted" /></label>
                </div>
                <div className="preset-row"><span className="eyebrow">Quick preset</span><button onClick={() => { setOriginText(origin.name); setDestinationText(destination.name); notify('Guwahati Railway Station → Assam Downtown University loaded.'); }}>Railway station → ADTU</button></div>
                <div className="filter-section">
                  <div className="eyebrow">Safety priority filters</div>
                  <div className="filter-grid">
                    <label className="check-row"><input type="checkbox" checked={filters.lighting} onChange={(event) => setFilters((current) => ({ ...current, lighting: event.target.checked }))} /><span>Better lighting</span></label>
                    <label className="check-row"><input type="checkbox" checked={filters.obstacles} onChange={(event) => setFilters((current) => ({ ...current, obstacles: event.target.checked }))} /><span>Avoid obstacles</span></label>
                    <label className="check-row"><input type="checkbox" checked={filters.pedestrian} onChange={(event) => setFilters((current) => ({ ...current, pedestrian: event.target.checked }))} /><span>Pedestrian continuity</span></label>
                    <button className="filter-settings" onClick={() => notify('Evidence weighting is adjustable through the filters above.')}><SlidersHorizontal size={14} /> Model weights</button>
                  </div>
                </div>
                <div className="action-row"><button className="primary-button" onClick={computeRoutes}><Sparkles size={16} /> Compute safe routes</button><button className="icon-button" onClick={resetDemo} title="Reset demo"><RefreshCw size={16} /></button></div>
              </section>

              <section className="demo-walkthrough">
                <div className="walkthrough-heading"><span className="eyebrow">60-second demo flow</span><Sparkles size={14} className="green-text" /></div>
                <div className="walkthrough-steps"><button onClick={computeRoutes}><span>1</span><strong>Compute</strong><small>compare routes</small></button><button onClick={() => setSelectedHazardId(routeHazards[0]?.id ?? hazards[0].id)}><span>2</span><strong>Inspect</strong><small>open evidence</small></button><button onClick={() => setShowReport(true)}><span>3</span><strong>Report</strong><small>re-score live</small></button></div>
              </section>

              <section className="routes-section">
                <div className="section-heading"><div><div className="heading-with-icon"><RouteIcon size={17} /><h2>Calculated trajectories <span className="muted">({routes.length})</span></h2></div><p>Ranked by estimated risk, coverage, and trip time</p></div><span className="freshness"><span className="live-dot" /> live</span></div>
                <div className="route-card-list">
                  {scoredRoutes.map(({ route, assessment }, index) => {
                    const risk = riskLabel(assessment.score);
                    const isActive = route.id === activeRouteId;
                    return <button key={route.id} className={`route-card ${isActive ? 'selected' : ''}`} onClick={() => { setActiveRouteId(route.id); setSelectedHazardId(null); }}>
                      <div className="route-card-top"><div><div className="route-title-row"><span className="route-index">0{index + 1}</span><h3>{route.name}</h3>{index === 0 && <span className="recommended-chip">recommended</span>}</div><p>{route.subtitle}</p></div><ArrowUpRight size={17} className="muted" /></div>
                      <div className="metric-grid"><div><span className="metric-label">Distance</span><strong>{route.distance}</strong></div><div><span className="metric-label">ETA</span><strong>{route.eta}</strong></div><div><span className="metric-label">Lighting</span><strong className={route.lighting >= 80 ? 'green-text' : 'amber-text'}>{route.lighting}%</strong></div></div>
                      <div className="score-row"><span className={`score-chip ${risk.tone}`}><span className="score-dot" /> {assessment.score}/100 · {risk.label}</span><span className="coverage-label">{assessment.coverage}% evidence</span></div>
                      {isActive && <div className="selected-line"><Check size={13} /> Active on map · click to inspect details</div>}
                    </button>;
                  })}
                </div>
              </section>

              <section className="panel-card active-detail-card">
                <div className="section-heading"><div><div className="eyebrow">Active route detail</div><h2>{activeRoute.name}</h2></div><span className="status-label good">{riskLabel(activeAssessment.score).label}</span></div>
                <div className="detail-summary"><div><span className="metric-label">Estimated trip</span><strong>{activeRoute.eta}</strong><small>{activeRoute.distance} · vehicle</small></div><div><span className="metric-label">Coverage</span><strong>{activeAssessment.coverage}%</strong><small>freshness-adjusted</small></div><div><span className="metric-label">Footfall</span><strong>{activeRoute.footfall}</strong><small>{activeRoute.crossings}</small></div></div>
                <div className="detail-warning"><div className="warning-icon"><AlertTriangle size={15} /></div><div><strong>{routeHazards.length ? `${routeHazards.length} evidence item${routeHazards.length > 1 ? 's' : ''} on this corridor` : 'No active corridor warning'}</strong><p>{routeHazards.length ? 'Review the map marker and source status before you start.' : 'Absence of a report does not prove a route is safe.'}</p></div></div>
                <div className="factor-strip">{activeAssessment.factors.map((factor) => <div key={factor.key}><span>{factor.label}</span><strong>+{factor.value}</strong><small>{factor.note}</small></div>)}</div>
                <div className="button-row"><button className="secondary-button" onClick={() => setShowNav(true)}><Navigation size={15} /> Start demo navigation</button><button className="text-button" onClick={() => setActiveTab('methodology')}>How we scored <ArrowRight size={14} /></button></div>
              </section>
            </aside>

            <section className="map-stage">
              <div className="map-toolbar"><div className="map-label"><span className="map-label-icon"><MapPin size={15} /></span><span><strong>Guwahati pilot area</strong><small>Railway Station → ADTU · map view</small></span></div><div className="map-actions"><button className="map-control" onClick={() => setMapZoom((value) => Math.min(1.25, value + 0.1))}><ZoomIn size={16} /></button><button className="map-control" onClick={() => setMapZoom((value) => Math.max(0.85, value - 0.1))}><ZoomOut size={16} /></button><button className="map-control" onClick={() => notify('Map centered on the active route.')}><Crosshair size={16} /></button><button className={`map-control ${showGrid ? 'active-control' : ''}`} onClick={() => setShowGrid((value) => !value)} title="Toggle spatial grid"><Layers3 size={16} /></button><button className="map-control" onClick={() => setMapLayers((current) => ({ ...current, evidence: !current.evidence }))} title="Toggle evidence markers"><AlertTriangle size={15} /></button></div></div>
              <div className="map-canvas-wrap">
                <svg className="route-map" viewBox="0 0 100 70" role="img" aria-label="Stylized Guwahati route map" style={{ transform: `scale(${mapZoom})` }}>
                  <defs><pattern id="minorGrid" width="4" height="4" patternUnits="userSpaceOnUse"><path d="M 4 0 L 0 0 0 4" fill="none" stroke="#dbe5dc" strokeWidth="0.12" /></pattern><filter id="softShadow"><feDropShadow dx="0" dy="0.5" stdDeviation="0.6" floodOpacity="0.2" /></filter></defs>
                  <rect width="100" height="70" fill="#eef4ea" /><rect width="100" height="70" fill="url(#minorGrid)" />
                  {renderedGridCells}
                  <path d="M0 9 C17 13 28 10 38 15 C51 22 63 14 73 10 C83 7 91 9 100 14 L100 0 L0 0 Z" fill="#e1ecdb" />
                  <path d="M3 65 C20 56 30 60 43 65 C57 70 76 61 100 65 L100 70 L0 70 Z" fill="#d9e9da" />
                  <path d="M0 57 C24 47 35 52 47 41 C61 27 76 34 100 20" fill="none" stroke="#c4d7bd" strokeWidth="3.8" opacity="0.8" />
                  <path d="M0 57 C24 47 35 52 47 41 C61 27 76 34 100 20" fill="none" stroke="#f7faf4" strokeWidth="2.2" opacity="0.9" />
                  <g className="road-lines">
                    <path d="M1 13 L98 56" /><path d="M3 29 L95 4" /><path d="M8 68 L77 2" /><path d="M23 0 L31 70" /><path d="M44 0 L51 70" /><path d="M69 0 L60 70" /><path d="M87 4 L79 68" /><path d="M0 42 L100 42" /><path d="M0 25 L100 25" /><path d="M14 0 L94 70" />
                  </g>
                  <g className="road-labels"><text x="14" y="57">RAILWAY COLONY</text><text x="41" y="29">PANBAZAR</text><text x="67" y="16">SIX MILE</text><text x="71" y="49">CHANDMARI</text><text x="23" y="22">BHARALUMUKH</text></g>
                  {mapLayers.route && routes.map((route) => { const isActive = route.id === activeRouteId; const points = route.points.map((point) => `${point.x},${point.y}`).join(' '); return <polyline key={route.id} points={points} fill="none" stroke={isActive ? route.color : '#ffffff'} strokeWidth={isActive ? 1.65 : 1.1} strokeLinecap="round" strokeLinejoin="round" opacity={isActive ? 1 : 0.72} className="route-line" onClick={() => setActiveRouteId(route.id)} />; })}
                  {mapLayers.risk && activeRoute.points.slice(1, -1).map((point, index) => <circle key={`risk-${index}`} cx={point.x} cy={point.y} r={index === 1 ? 2.2 : 1.4} fill={index === 1 ? '#f59e0b' : '#ffffff'} stroke={index === 1 ? '#b45309' : '#64748b'} strokeWidth="0.4" opacity={0.9} />)}
                  <g className="map-marker origin-marker" onClick={() => notify(origin.name)}><circle cx={origin.point.x} cy={origin.point.y} r="3.1" fill="#ffffff" stroke="#15803d" strokeWidth="0.65" filter="url(#softShadow)" /><circle cx={origin.point.x} cy={origin.point.y} r="1.2" fill="#15803d" /><text x={origin.point.x + 3} y={origin.point.y - 3}>RAILWAY STATION</text></g>
                  <g className="map-marker destination-marker" onClick={() => notify(destination.name)}><path d={`M${destination.point.x} ${destination.point.y + 3} L${destination.point.x - 2.2} ${destination.point.y - 2} L${destination.point.x + 2.2} ${destination.point.y - 2} Z`} fill="#dc2626" stroke="#ffffff" strokeWidth="0.45" /><circle cx={destination.point.x} cy={destination.point.y - 0.6} r="0.7" fill="#ffffff" /><text x={destination.point.x - 25} y={destination.point.y - 5}>ASSAM DOWNTOWN UNIVERSITY</text></g>
                  {mapLayers.evidence && hazards.map((hazard) => <g key={hazard.id} className="hazard-marker" onClick={() => setSelectedHazardId(hazard.id)}><circle cx={hazard.point.x} cy={hazard.point.y} r={selectedHazardId === hazard.id ? 2.8 : 2.2} fill={hazard.severity === 'High' ? '#dc2626' : '#d97706'} stroke="#ffffff" strokeWidth="0.7" /><path d={`M${hazard.point.x} ${hazard.point.y - 0.8} v1.7 M${hazard.point.x - 0.8} ${hazard.point.y} h1.6`} stroke="#fff" strokeWidth="0.45" /></g>)}
                </svg>
                <div className="map-legend"><div><span className="legend-line green-line" /> active route</div><div><span className="legend-line amber-line" /> evidence item</div><div><span className="legend-dot red-dot" /> destination</div><div><span className="legend-cell" /> spatial grid cell</div></div>
                <div className="map-scale">500 m</div>
                <div className="map-attribution">Demo geometry · OpenStreetMap-style context · not for emergency routing</div>
              </div>
              <div className="map-bottom-bar"><div className="map-bottom-status"><span className="status-icon"><Gauge size={15} /></span><span><strong>Route engine status</strong><small>{activeAssessment.coverage}% evidence coverage · {activeAssessment.routeHazards.length} corridor warning{activeAssessment.routeHazards.length === 1 ? '' : 's'}</small></span></div><button className="secondary-button compact" onClick={() => setShowNav(true)}><Navigation size={14} /> Preview guidance</button></div>
              {selectedHazard && <HazardDrawer hazard={selectedHazard} onClose={() => setSelectedHazardId(null)} onNavigate={() => { setActiveRouteId(selectedHazard.routes[0]); setSelectedHazardId(null); }} />}
            </section>
          </div>
        )}

        {activeTab === 'reports' && <ReportsView hazards={hazards} onSelect={(id) => { setActiveTab('planner'); setSelectedHazardId(id); }} onReport={() => setShowReport(true)} />}
        {activeTab === 'methodology' && <MethodologyView />}
      </main>

      <footer className="site-footer"><div><Shield size={14} /> Safe Route is an experimental, evidence-based route-risk estimate. It cannot guarantee safety or detect every incident.</div><div>Demo scope · Guwahati Railway Station to Assam Downtown University</div></footer>

      {showReport && <ReportModal onClose={() => setShowReport(false)} onSubmit={submitHazard} />}
      {showNav && <NavigationModal route={activeRoute} step={navStep} steps={navSteps} onClose={() => setShowNav(false)} onStep={setNavStep} />}
      {toast && <div className="toast"><Check size={15} /> {toast}</div>}
    </div>
  );
}

function HazardDrawer({ hazard, onClose, onNavigate }: { hazard: Hazard; onClose: () => void; onNavigate: () => void }) {
  return <aside className="hazard-drawer"><div className="drawer-top"><div className="heading-with-icon"><span className={`icon-box ${hazard.severity === 'High' ? 'red' : 'amber'}`}><AlertTriangle size={17} /></span><div><div className="eyebrow">Evidence detail</div><h2>{hazard.title}</h2></div></div><button className="icon-button" onClick={onClose}><X size={16} /></button></div><div className="drawer-status-row"><span className={`status-label ${hazard.verification === 'Verified' ? 'good' : hazard.verification === 'Reported' ? 'warn' : 'neutral'}`}>{hazard.verification}</span><span className="freshness-label"><Clock3 size={13} /> {hazard.freshness}</span></div><div className="drawer-grid"><div><span className="metric-label">Location</span><strong>{hazard.location}</strong></div><div><span className="metric-label">Severity</span><strong className={hazard.severity === 'High' ? 'red-text' : 'amber-text'}>{hazard.severity}</strong></div><div><span className="metric-label">Source</span><strong>{hazard.source}</strong></div><div><span className="metric-label">Route effect</span><strong>+{hazard.scoreImpact} estimate points</strong></div></div><p className="drawer-summary">{hazard.summary}</p><div className="uncertainty-box"><Info size={15} /><span>This evidence is matched to nearby route geometry, not treated as a blanket verdict on the entire area.</span></div><div className="button-row"><button className="secondary-button" onClick={onNavigate}><RouteIcon size={15} /> Inspect affected route</button><button className="text-button" onClick={onClose}>Close <X size={13} /></button></div></aside>;
}

function ReportsView({ hazards, onSelect, onReport }: { hazards: Hazard[]; onSelect: (id: string) => void; onReport: () => void }) {
  return <div className="content-page"><div className="content-page-header"><div><div className="eyebrow">Evidence ledger · Guwahati pilot</div><h1>Recent hazard reports</h1><p>Every item carries a source, freshness label, verification state, and a documented route impact.</p></div><button className="primary-button" onClick={onReport}><Plus size={16} /> Report a hazard</button></div><div className="report-summary-strip"><div><strong>{hazards.length}</strong><span>tracked items</span></div><div><strong>{hazards.filter((hazard) => hazard.verification === 'Verified').length}</strong><span>verified signals</span></div><div><strong>{hazards.filter((hazard) => hazard.verification === 'Needs review').length}</strong><span>needs review</span></div><div><strong>12 min</strong><span>last checked</span></div></div><div className="report-list">{hazards.map((hazard) => <button className="report-row" key={hazard.id} onClick={() => onSelect(hazard.id)}><div className={`report-icon ${hazard.severity.toLowerCase()}`}><AlertTriangle size={17} /></div><div className="report-main"><div className="report-title-row"><h2>{hazard.title}</h2><span className={`status-label ${hazard.verification === 'Verified' ? 'good' : hazard.verification === 'Reported' ? 'warn' : 'neutral'}`}>{hazard.verification}</span></div><p>{hazard.summary}</p><div className="report-meta"><span><MapPin size={13} /> {hazard.location}</span><span><Clock3 size={13} /> {hazard.freshness}</span><span><FileText size={13} /> {hazard.source}</span></div></div><div className="report-impact"><span className="metric-label">Route impact</span><strong>+{hazard.scoreImpact}</strong><ArrowRight size={15} /></div></button>)}</div></div>;
}

function MethodologyView() {
  return <div className="content-page methodology-page"><div className="content-page-header"><div><div className="eyebrow">Transparent by design</div><h1>How the demo route engine works</h1><p>Safe Route separates estimated risk from evidence confidence so missing data is not silently scored as safe.</p></div><div className="method-badge"><BarChart3 size={17} /> deterministic model</div></div><div className="method-grid"><section className="method-card wide"><div className="method-card-heading"><span className="number-badge">01</span><div><h2>Compare actual route geometry</h2><p>The planner keeps three route alternatives with different distance, lighting continuity, pedestrian continuity, and evidence coverage.</p></div></div><div className="formula-row"><div className="formula-cell"><Lightbulb size={17} /><strong>Lighting gap</strong><span>0–18 points</span></div><div className="formula-cell"><TrafficCone size={17} /><strong>Active evidence</strong><span>source-weighted</span></div><div className="formula-cell"><Bike size={17} /><strong>Pedestrian continuity</strong><span>0–4 points</span></div><ArrowRight size={18} className="muted" /><div className="formula-result"><Gauge size={19} /><strong>Estimated risk</strong><span>0–100</span></div></div></section><section className="method-card"><div className="method-card-heading"><span className="number-badge">02</span><div><h2>Keep confidence separate</h2><p>Evidence coverage reflects how much of the route has usable signals. A low-coverage corridor is unknown, not automatically safe.</p></div></div><div className="coverage-demo"><div className="coverage-top"><span>Coverage example</span><strong>78%</strong></div><div className="coverage-track"><span style={{ width: '78%' }} /></div><small>Freshness-adjusted across mapped segments</small></div></section><section className="method-card"><div className="method-card-heading"><span className="number-badge">03</span><div><h2>Explain every warning</h2><p>Reports show source, timestamps, verification status, uncertainty, and the route segments they can affect.</p></div></div><div className="method-status-list"><div><span className="status-label good">Verified</span><span>field or official evidence</span></div><div><span className="status-label warn">Reported</span><span>community or bulletin signal</span></div><div><span className="status-label neutral">Needs review</span><span>new user-submitted item</span></div></div></section><section className="method-card wide limitation-card"><Info size={18} className="amber-text" /><div><h2>Important limitation</h2><p>This is a hackathon demonstration. It does not guarantee safety, predict every incident, replace emergency services, or claim that a lack of reports means a road is safe. The map uses curated demo geometry for a small Guwahati area and is not turn-by-turn emergency navigation.</p></div></section></div></div>;
}

function ReportModal({ onClose, onSubmit }: { onClose: () => void; onSubmit: (event: React.FormEvent<HTMLFormElement>) => void }) {
  return <div className="modal-scrim"><div className="modal-card"><div className="modal-heading"><div><div className="eyebrow">Community evidence · demo</div><h2>Report a hazard</h2><p>New reports are marked <strong>Needs review</strong> and immediately re-run through the route engine.</p></div><button className="icon-button" onClick={onClose}><X size={17} /></button></div><form onSubmit={onSubmit}><div className="form-grid"><label>Hazard type<select name="type" defaultValue="Road obstruction"><option>Road obstruction</option><option>Low lighting</option><option>Flooding</option><option>Traffic incident</option></select></label><label>Severity<select name="severity" defaultValue="Medium"><option>Low</option><option>Medium</option><option>High</option></select></label><label>Nearby corridor<select name="location" defaultValue="AT Road"><option>AT Road</option><option>GS Road</option><option>Panbazar</option></select></label><label className="full-width">What did you observe?<textarea name="description" required minLength={10} placeholder="Describe the issue briefly, including what a traveller should look out for." /></label></div><div className="form-note"><Info size={14} /> Do not include personal information. This prototype stores the report only in the current demo session.</div><div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancel</button><button type="submit" className="primary-button"><Flag size={15} /> Submit report</button></div></form></div></div>;
}

function NavigationModal({ route, step, steps, onClose, onStep }: { route: Route; step: number; steps: string[]; onClose: () => void; onStep: (step: number) => void }) {
  const progress = ((step + 1) / steps.length) * 100;
  return <div className="modal-scrim"><div className="navigation-card"><div className="nav-preview-map"><div className="nav-map-grid" /><div className="nav-route-line" /><div className="nav-pulse" /><div className="nav-compass"><Navigation size={19} /></div><span className="nav-location-label">{step === 0 ? 'Railway Station' : step === steps.length - 1 ? 'ADTU main gate' : route.shortName}</span></div><div className="navigation-content"><div className="modal-heading"><div><div className="eyebrow">Demo navigation · {route.name}</div><h2>{steps[step]}</h2></div><button className="icon-button" onClick={onClose}><X size={17} /></button></div><div className="progress-track"><span style={{ width: `${progress}%` }} /></div><div className="nav-progress-label"><span>Step {step + 1} of {steps.length}</span><span>{route.eta} estimated</span></div><div className="nav-callout"><Target size={18} className="green-text" /><div><strong>Follow the highlighted corridor</strong><p>Guidance is simulated for the demo route. Re-check evidence before travelling.</p></div></div><div className="modal-actions"><button className="secondary-button" onClick={() => onStep(Math.max(0, step - 1))} disabled={step === 0}>Previous</button>{step < steps.length - 1 ? <button className="primary-button" onClick={() => onStep(step + 1)}>Next instruction <ArrowRight size={15} /></button> : <button className="primary-button" onClick={onClose}><Check size={15} /> Finish preview</button>}</div></div></div></div>;
}

export default App;
