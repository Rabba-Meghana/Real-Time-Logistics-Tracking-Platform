import { Component, createResource, createSignal, For, Show, onMount, onCleanup } from 'solid-js';
import { vesselsApi } from '../api';
import Header from '../components/Header';
import type { AnomalyLog, Vessel } from '../types';
import { format, parseISO } from 'date-fns';

export const Anomalies: Component = () => {
  const [filter, setFilter] = createSignal('');
  const [anomalies, { refetch }] = createResource(
    () => filter(),
    async () => {
      const res = await vesselsApi.anomalies();
      const data = res.data;
      return (data?.results ?? data) as AnomalyLog[];
    }
  );
  const [summary] = createResource(() => vesselsApi.anomalySummary().then(r => r.data));

  return (
    <div style={{ display:'flex', 'flex-direction':'column', height:'100%' }}>
      <Header title="Anomalies" subtitle="Real-time anomaly detection across active fleet" />
      <div class="page-content fade-in">
        <Show when={summary()}>
          <div style={{ display:'grid', 'grid-template-columns':'repeat(auto-fill, minmax(180px,1fr))', gap:'14px', 'margin-bottom':'20px' }}>
            <div class="stat-card">
              <div class="stat-label">Unresolved</div>
              <div class="stat-value" style={{ color:'var(--status-delayed)' }}>{summary()!.unresolved_total}</div>
            </div>
            <div class="stat-card">
              <div class="stat-label">Critical</div>
              <div class="stat-value" style={{ color:'var(--status-delayed)' }}>{summary()!.critical_unresolved}</div>
            </div>
            {Object.entries(summary()!.last_24h_by_type ?? {}).slice(0,2).map(([k,v]) => (
              <div class="stat-card">
                <div class="stat-label">{k.replace(/_/g,' ')}</div>
                <div class="stat-value">{String(v)}</div>
                <div class="stat-sub">last 24h</div>
              </div>
            ))}
          </div>
        </Show>

        <div style={{ display:'flex', gap:'10px', 'margin-bottom':'16px' }}>
          <select class="input" style={{ width:'180px', 'font-size':'0.83rem' }} value={filter()} onChange={e => setFilter(e.currentTarget.value)}>
            <option value="">All severities</option>
            {['critical','high','medium','low'].map(s => <option value={s}>{s}</option>)}
          </select>
          <button class="btn btn-primary btn-sm" onClick={() => refetch()}>Refresh</button>
        </div>

        <div class="card">
          <Show when={anomalies.loading}>
            <div style={{ display:'flex', 'justify-content':'center', padding:'60px' }}><div class="spinner"/></div>
          </Show>
          <Show when={!anomalies.loading}>
            <Show when={anomalies()?.length === 0 || !anomalies()}>
              <div style={{ padding:'48px', 'text-align':'center', color:'var(--text-muted)' }}>
                <div style={{ 'font-size':'2rem', 'margin-bottom':'8px' }}>✓</div>
                <div style={{ 'font-family':'var(--font-display)', 'font-size':'1.1rem', 'margin-bottom':'4px' }}>No anomalies detected</div>
                <div style={{ 'font-size':'0.80rem' }}>All vessels operating normally. Detection runs every 2 minutes.</div>
              </div>
            </Show>
            <Show when={anomalies() && anomalies()!.length > 0}>
              <div class="table-wrap">
                <table>
                  <thead>
                    <tr><th>Vessel</th><th>MMSI</th><th>Type</th><th>Severity</th><th>Description</th><th>Detected</th><th>Status</th></tr>
                  </thead>
                  <tbody>
                    <For each={anomalies()!}>
                      {(a: AnomalyLog) => (
                        <tr>
                          <td style={{ 'font-weight':'500' }}>{a.vessel_name}</td>
                          <td><code style={{ 'font-size':'0.74rem', 'font-family':'var(--font-mono)', color:'var(--text-muted)' }}>{a.vessel_mmsi}</code></td>
                          <td style={{ 'font-size':'0.80rem', 'text-transform':'capitalize' }}>{a.anomaly_type.replace(/_/g,' ')}</td>
                          <td><span class={`badge badge-${a.severity}`}>{a.severity}</span></td>
                          <td style={{ 'font-size':'0.78rem', color:'var(--text-secondary)', 'max-width':'320px' }}>{a.description}</td>
                          <td style={{ 'font-size':'0.76rem', color:'var(--text-muted)' }}>{format(parseISO(a.detected_at), 'MMM d, HH:mm')}</td>
                          <td><span class={`badge badge-${a.is_resolved ? 'valid' : 'pending'}`}>{a.is_resolved ? 'resolved' : 'open'}</span></td>
                        </tr>
                      )}
                    </For>
                  </tbody>
                </table>
              </div>
            </Show>
          </Show>
        </div>
      </div>
    </div>
  );
};

export const Fleet: Component = () => {
  const [vessels, { refetch }] = createResource(async () => {
    // Fetch all vessels across pages
    let allVessels: Vessel[] = [];
    let page = 1;
    while (true) {
      const r = await vesselsApi.list({ page: String(page), page_size: '200' });
      const data = r.data;
      const results = (data?.results ?? data) as Vessel[];
      allVessels = [...allVessels, ...results];
      if (!data?.next || results.length < 200) break;
      page++;
    }
    return allVessels;
  });

  // Manual refresh only — no auto-polling to avoid constant loading

  return (
    <div style={{ display:'flex', 'flex-direction':'column', height:'100%' }}>
      <Header title="Fleet" subtitle={`Vessel registry and real-time status · ${vessels()?.length ?? 0} vessels`} />
      <div class="page-content fade-in">
        <div class="card">
          <div style={{ display:'flex', 'justify-content':'flex-end', 'margin-bottom':'12px' }}>
            <button class="btn btn-ghost" onClick={() => refetch()} style={{ display:'flex', 'align-items':'center', gap:'6px', 'font-size':'0.82rem' }}>
              ↻ Refresh
            </button>
          </div>
          <Show when={vessels.loading}>
            <div style={{ display:'flex', 'justify-content':'center', padding:'60px' }}><div class="spinner"/></div>
          </Show>
          <Show when={!vessels.loading && vessels()}>
            <div class="table-wrap">
              <table>
                <thead>
                  <tr><th>Name</th><th>MMSI</th><th>Type</th><th>Flag</th><th>Last Position</th><th>Speed</th><th>Status</th></tr>
                </thead>
                <tbody>
                  <For each={vessels()!}>
                    {(v: Vessel) => {
                      const pos = v.latest_position as any;
                      const lat = pos?.latitude ?? pos?.lat;
                      const lon = pos?.longitude ?? pos?.lon;
                      return (
                        <tr>
                          <td style={{ 'font-weight':'500' }}>{v.name}</td>
                          <td><code style={{ 'font-size':'0.74rem', 'font-family':'var(--font-mono)', color:'var(--accent)' }}>{v.mmsi}</code></td>
                          <td><span class={`badge badge-${v.vessel_type}`}>{v.vessel_type}</span></td>
                          <td style={{ 'font-family':'var(--font-mono)', 'font-size':'0.82rem' }}>{v.flag}</td>
                          <td style={{ 'font-size':'0.76rem', color:'var(--text-secondary)', 'font-family':'var(--font-mono)' }}>
                            {lat && lon ? `${Number(lat).toFixed(3)}°, ${Number(lon).toFixed(3)}°` : '—'}
                          </td>
                          <td style={{ 'font-family':'var(--font-mono)', 'font-size':'0.82rem' }}>
                            {pos?.speed_over_ground != null ? `${Number(pos.speed_over_ground).toFixed(1)} kt` : '—'}
                          </td>
                          <td><span class={`badge badge-${v.is_active ? 'active' : 'completed'}`}>{v.is_active ? 'active' : 'inactive'}</span></td>
                        </tr>
                      );
                    }}
                  </For>
                </tbody>
              </table>
            </div>
          </Show>
        </div>
      </div>
    </div>
  );
};
