import { Component, createResource, createSignal, For, Show } from 'solid-js';
import { vesselsApi } from '../api';
import Header from '../components/Header';
import type { AnomalyLog, Vessel } from '../types';
import { format, parseISO } from 'date-fns';

export const Anomalies: Component = () => {
  const [filter, setFilter] = createSignal('');
  const [anomalies, { refetch }] = createResource(
    () => filter(),
    (sev) => {
      const params: Record<string, string> = { is_resolved: 'false' };
      if (sev) params.severity = sev;
      return vesselsApi.anomalies().then(r => r.data);
    }
  );
  const [summary] = createResource(() => vesselsApi.anomalySummary().then(r => r.data));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Header title="Anomalies" subtitle="Real-time anomaly detection across active fleet" />
      <div class="page-content fade-in">

        <Show when={summary()}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '14px', marginBottom: '20px' }}>
            {[
              ['Unresolved', summary()!.unresolved_total, 'var(--status-delayed)'],
              ['Critical', summary()!.critical_unresolved, 'var(--status-delayed)'],
              ...Object.entries(summary()!.last_24h_by_type ?? {}).slice(0, 2).map(([k, v]) => [k.replace(/_/g, ' '), v, '']),
            ].map(([label, val, color]) => (
              <div class="stat-card">
                <div class="stat-label">{label}</div>
                <div class="stat-value" style={color ? { color: color as string } : {}}>{val as string}</div>
              </div>
            ))}
          </div>
        </Show>

        <div style={{ display: 'flex', gap: '10px', marginBottom: '16px' }}>
          <select class="input" style={{ width: '180px', fontSize: '0.83rem' }} value={filter()} onChange={e => setFilter(e.currentTarget.value)}>
            <option value="">All severities</option>
            {['critical','high','medium','low'].map(s => <option value={s}>{s}</option>)}
          </select>
          <button class="btn btn-primary btn-sm" onClick={() => refetch()}>Refresh</button>
        </div>

        <div class="card">
          <div class="table-wrap">
            <Show when={anomalies.loading}>
              <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}><div class="spinner" /></div>
            </Show>
            <Show when={!anomalies.loading && anomalies()}>
              <table>
                <thead>
                  <tr>
                    <th>Vessel</th>
                    <th>MMSI</th>
                    <th>Type</th>
                    <th>Severity</th>
                    <th>Description</th>
                    <th>Detected</th>
                    <th>Position</th>
                    <th>Resolved</th>
                  </tr>
                </thead>
                <tbody>
                  <For each={anomalies()?.results ?? anomalies()}>
                    {(a: AnomalyLog) => (
                      <tr>
                        <td style={{ fontWeight: '500' }}>{a.vessel_name}</td>
                        <td><code style={{ fontSize: '0.76rem', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>{a.vessel_mmsi}</code></td>
                        <td style={{ fontSize: '0.80rem', textTransform: 'capitalize' }}>{a.anomaly_type.replace(/_/g, ' ')}</td>
                        <td><span class={`badge badge-${a.severity}`}>{a.severity}</span></td>
                        <td style={{ fontSize: '0.80rem', color: 'var(--text-secondary)', maxWidth: '300px' }}>{a.description}</td>
                        <td style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                          {format(parseISO(a.detected_at), 'MMM d, HH:mm')}
                        </td>
                        <td style={{ fontSize: '0.76rem', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                          {a.latitude && a.longitude ? `${a.latitude.toFixed(3)}, ${a.longitude.toFixed(3)}` : '—'}
                        </td>
                        <td>
                          {a.is_resolved
                            ? <span class="badge badge-valid">resolved</span>
                            : <span class="badge badge-pending">open</span>}
                        </td>
                      </tr>
                    )}
                  </For>
                </tbody>
              </table>
            </Show>
          </div>
        </div>
      </div>
    </div>
  );
};

export const Fleet: Component = () => {
  const [vessels] = createResource(() => vesselsApi.list().then(r => r.data));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Header title="Fleet" subtitle="Vessel registry and real-time status" />
      <div class="page-content fade-in">
        <div class="card">
          <div class="table-wrap">
            <Show when={vessels.loading}>
              <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}><div class="spinner" /></div>
            </Show>
            <Show when={!vessels.loading && vessels()}>
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>MMSI</th>
                    <th>Type</th>
                    <th>Flag</th>
                    <th>Length</th>
                    <th>Gross Tonnage</th>
                    <th>Last Position</th>
                    <th>Speed</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  <For each={vessels()?.results ?? vessels()}>
                    {(v: Vessel) => (
                      <tr>
                        <td style={{ fontWeight: '500' }}>{v.name}</td>
                        <td><code style={{ fontSize: '0.76rem', fontFamily: 'var(--font-mono)', color: 'var(--accent)' }}>{v.mmsi}</code></td>
                        <td style={{ textTransform: 'capitalize' }}>
                          <span class={`badge badge-${v.vessel_type === 'barge' ? 'active' : 'planned'}`}>{v.vessel_type}</span>
                        </td>
                        <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.82rem' }}>{v.flag}</td>
                        <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.82rem' }}>{v.length ? `${v.length.toFixed(0)}m` : '—'}</td>
                        <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.82rem' }}>{v.gross_tonnage?.toLocaleString() ?? '—'}</td>
                        <td style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                          {v.latest_position
                            ? (() => { const p = v.latest_position as any; return p?.lat ? `${Number(p.lat).toFixed(3)}, ${Number(p.lon).toFixed(3)}` : p?.latitude ? `${Number(p.latitude).toFixed(3)}, ${Number(p.longitude).toFixed(3)}` : '—'; })()
                            : '—'}
                        </td>
                        <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.82rem' }}>
                          {v.latest_position ? `${(v.latest_position as { speed_over_ground: number }).speed_over_ground?.toFixed(1)} kt` : '—'}
                        </td>
                        <td><span class={`badge badge-${v.is_active ? 'active' : 'completed'}`}>{v.is_active ? 'active' : 'inactive'}</span></td>
                      </tr>
                    )}
                  </For>
                </tbody>
              </table>
            </Show>
          </div>
        </div>
      </div>
    </div>
  );
};
