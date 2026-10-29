import { useEffect, useState } from 'react';
import { AlertTriangle, ExternalLink, RefreshCw } from 'lucide-react';
import { fetchExternalIncidents } from '../services/incidents';
import type { IngestionResult } from '../services/incidents';

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Unknown date' : new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function formatLabel(value: string) {
  return value.replace(/_/g, ' ');
}

export default function ExternalIncidents() {
  const [result, setResult] = useState<IngestionResult | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [requestNumber, setRequestNumber] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');

    fetchExternalIncidents(controller.signal)
      .then(setResult)
      .catch((requestError: unknown) => {
        if (requestError instanceof Error && requestError.name !== 'AbortError') setError(requestError.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [requestNumber]);

  const failedSources = result?.sources.filter((source) => source.status === 'failed') ?? [];

  return <section className="external-incidents" aria-labelledby="external-incidents-heading">
    <div className="external-incidents-header">
      <div>
        <div className="eyebrow">GDELT news index · external feed</div>
        <h2 id="external-incidents-heading">External incident evidence</h2>
        <p>News mentions are unverified evidence, not confirmation of a current road hazard. They never affect route selection.</p>
      </div>
      <button className="icon-button" type="button" title="Refresh external evidence" aria-label="Refresh external evidence" onClick={() => setRequestNumber((number) => number + 1)} disabled={loading}>
        <RefreshCw size={16} className={loading ? 'spin-icon' : undefined} />
      </button>
    </div>

    {loading && <div className="routing-message" role="status">Loading external news evidence…</div>}
    {error && <div className="routing-message error-message" role="alert">{error}</div>}
    {failedSources.length > 0 && <div className="routing-message error-message" role="status">
      {failedSources.map((source) => `${source.sourceId}: ${source.errorMessage ?? 'source unavailable'}`).join(' · ')}
    </div>}
    {!loading && !error && failedSources.length === 0 && result?.incidents.length === 0 && <div className="routing-message">No matching external reports were returned. This does not indicate that a road is clear.</div>}

    {result && result.incidents.length > 0 && <div className="external-incident-list">
      {result.incidents.map((incident) => <article className="external-incident" key={incident.id}>
        <div className="external-incident-icon"><AlertTriangle size={16} /></div>
        <div className="external-incident-content">
          <div className="external-incident-title-row">
            <h3>{incident.description}</h3>
            <span className="status-label warn">Unverified</span>
            {incident.isStale && <span className="status-label neutral">Stale report</span>}
          </div>
          <div className="external-incident-meta">
            <span>{formatLabel(incident.category)}</span>
            <span>{incident.locationText ?? 'Location unresolved'}</span>
            <span>Location: {formatLabel(incident.locationConfidence)}</span>
            <span>Published {formatDate(incident.publishedAt)}</span>
            <a href={incident.sourceUrl} target="_blank" rel="noreferrer">{incident.sourceName}<ExternalLink size={12} /></a>
          </div>
          {incident.qualityFlags.length > 0 && <div className="external-incident-flags">Data notes: {incident.qualityFlags.map(formatLabel).join(', ')}</div>}
        </div>
      </article>)}
    </div>}

    {result && <div className="external-feed-footer">Retrieved {formatDate(result.retrievedAt)} · GDELT DOC 2.0 · no coordinates inferred</div>}
  </section>;
}