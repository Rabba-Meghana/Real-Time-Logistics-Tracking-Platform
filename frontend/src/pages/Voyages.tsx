import { Component, createResource, createSignal, For, Show } from 'solid-js';
import { voyagesApi } from '../api';
import Header from '../components/Header';
import type { Voyage } from '../types';
import { format, parseISO } from 'date-fns';

const Voyages: Component = () => {
  const [statusFilter, setStatusFilter] = createSignal('');
  const [cargoFilter, setCargoFilter] = createSignal('');
  const [selected, setSelected] = createSignal<Voyage | null>(null);

  const [voyages, { refetch }] = createResource(
    () => ({ status: statusFilter(), cargo: cargoFilter() }),
    ({ status, cargo }) => {
      const params: Record<string, string> = {};
      if (status) params.status = status;
      if (cargo) params.cargo_type = cargo;
      return voyagesApi.list(params).then(r => r.data);
    }
  );

  const statusBadge = (status: string) => (
    <span class={`badge badge-${status}`}>{status}</span>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Header title="Voyages" subtitle="50,000+ voyage records across US inland waterways" />
      <div class="page-content fade-in" style={{ display: 'flex', gap: '20px', overflow: 'hidden', flex: '1', padding: '24px 28px' }}>

        {/* Main table */}
        <div style={{ flex: '1', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexShrink: '0' }}>
            <select class="input" style={{ width: '160px', fontSize: '0.83rem' }} value={statusFilter()} onChange={e => setStatusFilter(e.currentTarget.value)}>
              <option value="">All statuses</option>
              {['active','delayed','planned','completed','cancelled'].map(s => <option value={s}>{s}</option>)}
            </select>
            <select class="input" style={{ width: '160px', fontSize: '0.83rem' }} value={cargoFilter()} onChange={e => setCargoFilter(e.currentTarget.value)}>
              <option value="">All cargo</option>
              {['grain','coal','petroleum','chemicals','containers','steel','aggregate','fertilizer','other'].map(c => <option value={c}>{c}</option>)}
            </select>
            <button class="btn btn-ghost btn-sm" onClick={() => { setStatusFilter(''); setCargoFilter(''); }}>Clear</button>
            <button class="btn btn-primary btn-sm" onClick={() => refetch()}>Refresh</button>
          </div>

          <div class="card" style={{ flex: '1', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div class="table-wrap" style={{ flex: '1', overflow: 'auto' }}>
              <Show when={voyages.loading}>
                <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}>
                  <div class="spinner" />
                </div>
              </Show>
              <Show when={!voyages.loading && voyages()}>
                <table>
                  <thead>
                    <tr>
                      <th>Voyage</th>
                      <th>Vessel</th>
                      <th>Route</th>
                      <th>Cargo</th>
                      <th>Weight (t)</th>
                      <th>Departed</th>
                      <th>ETA</th>
                      <th>Distance</th>
                      <th>Cost</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    <For each={voyages()?.results ?? voyages()}>
                      {(v: Voyage) => (
                        <tr onClick={() => setSelected(v)} style={selected()?.id === v.id ? { background: 'var(--accent-subtle)' } : {}}>
                          <td><code style={{ fontSize: '0.78rem', fontFamily: 'var(--font-mono)', color: 'var(--accent)' }}>{v.voyage_number}</code></td>
                          <td style={{ fontWeight: '500' }}>{v.barge_name}</td>
                          <td style={{ fontSize: '0.80rem', color: 'var(--text-secondary)' }}>
                            {v.origin_port_code} → {v.destination_port_code}
                          </td>
                          <td style={{ textTransform: 'capitalize', fontSize: '0.82rem' }}>{v.cargo_type}</td>
                          <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.82rem' }}>{v.cargo_weight_tons?.toLocaleString()}</td>
                          <td style={{ fontSize: '0.80rem', color: 'var(--text-secondary)' }}>
                            {v.departure_date ? format(parseISO(v.departure_date), 'MMM d, yy') : '—'}
                          </td>
                          <td style={{ fontSize: '0.80rem', color: v.is_delayed ? 'var(--status-delayed)' : 'var(--text-secondary)' }}>
                            {v.estimated_arrival ? format(parseISO(v.estimated_arrival), 'MMM d, yy') : '—'}
                            {v.is_delayed && ' ⚠'}
                          </td>
                          <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.80rem' }}>
                            {v.distance_nm ? `${v.distance_nm.toFixed(0)} nm` : '—'}
                          </td>
                          <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.82rem', color: 'var(--gold-700)' }}>
                            ${parseFloat(v.total_agreed_cost).toLocaleString()}
                          </td>
                          <td>{statusBadge(v.status)}</td>
                        </tr>
                      )}
                    </For>
                  </tbody>
                </table>
              </Show>
            </div>
          </div>
        </div>

        {/* Detail panel */}
        <Show when={selected()}>
          {(voyage) => (
            <div class="card fade-in" style={{ width: '320px', flexShrink: '0', overflow: 'auto', alignSelf: 'flex-start', maxHeight: '100%' }}>
              <div class="card-header">
                <span style={{ fontFamily: 'var(--font-display)', fontSize: '1rem' }}>Voyage Detail</span>
                <button class="btn btn-ghost btn-sm" onClick={() => setSelected(null)}>×</button>
              </div>
              <div class="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <code style={{ fontFamily: 'var(--font-mono)', fontSize: '0.9rem', color: 'var(--accent)' }}>{voyage().voyage_number}</code>
                  {statusBadge(voyage().status)}
                </div>

                {[
                  ['Vessel', voyage().barge_name],
                  ['MMSI', voyage().barge_mmsi],
                  ['Origin', `${voyage().origin_port_name} (${voyage().origin_port_code})`],
                  ['Destination', `${voyage().destination_port_name} (${voyage().destination_port_code})`],
                  ['Cargo', `${voyage().cargo_type} · ${voyage().cargo_weight_tons?.toLocaleString()} t`],
                  ['Distance', voyage().distance_nm ? `${voyage().distance_nm!.toFixed(1)} nm` : '—'],
                  ['Rate', `$${parseFloat(voyage().agreed_rate_per_ton).toFixed(2)}/t`],
                  ['Total Cost', `$${parseFloat(voyage().total_agreed_cost).toLocaleString()}`],
                  ['Departed', voyage().departure_date ? format(parseISO(voyage().departure_date), 'MMM d yyyy HH:mm') : '—'],
                  ['ETA', voyage().estimated_arrival ? format(parseISO(voyage().estimated_arrival!), 'MMM d yyyy HH:mm') : '—'],
                ].map(([label, val]) => (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', borderBottom: '1px solid var(--border)', paddingBottom: '8px' }}>
                    <span style={{ color: 'var(--text-muted)', textTransform: 'uppercase', fontSize: '0.68rem', letterSpacing: '0.06em', alignSelf: 'center' }}>{label}</span>
                    <span style={{ color: 'var(--text-primary)', textAlign: 'right', maxWidth: '180px' }}>{val}</span>
                  </div>
                ))}

                <Show when={voyage().events?.length}>
                  <div style={{ marginTop: '4px' }}>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>Events</div>
                    <For each={voyage().events?.slice(0, 5)}>
                      {(ev) => (
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', marginBottom: '6px' }}>
                          <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--accent)', marginTop: '5px', flexShrink: '0' }} />
                          <div>
                            <div style={{ fontSize: '0.78rem', fontWeight: '500', textTransform: 'capitalize' }}>{ev.event_type.replace(/_/g, ' ')}</div>
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{format(parseISO(ev.occurred_at), 'MMM d, HH:mm')}</div>
                          </div>
                        </div>
                      )}
                    </For>
                  </div>
                </Show>
              </div>
            </div>
          )}
        </Show>
      </div>
    </div>
  );
};

export default Voyages;
