import { Component, createResource, createSignal, For, Show } from 'solid-js';
import { voyagesApi } from '../api';
import Header from '../components/Header';
import type { Voyage } from '../types';
import { format, parseISO } from 'date-fns';

const Voyages: Component = () => {
  const [statusFilter, setStatusFilter] = createSignal('');
  const [cargoFilter, setCargoFilter] = createSignal('');
  const [page, setPage] = createSignal(1);
  const [selected, setSelected] = createSignal<Voyage | null>(null);

  const [voyageData, { refetch }] = createResource(
    () => ({ status: statusFilter(), cargo: cargoFilter(), page: page() }),
    ({ status, cargo, page }) => {
      const params: Record<string, string> = { page: String(page), page_size: '100' };
      if (status) params.status = status;
      if (cargo) params.cargo_type = cargo;
      return voyagesApi.list(params).then(r => r.data);
    }
  );

  const voyages = () => {
    const d = voyageData();
    return (d?.results ?? d ?? []) as Voyage[];
  };
  const totalCount = () => (voyageData() as any)?.count ?? voyages().length;
  const totalPages = () => Math.ceil(totalCount() / 100);

  const badge = (status: string) => <span class={`badge badge-${status}`}>{status}</span>;

  return (
    <div style={{ display:'flex', 'flex-direction':'column', height:'100%' }}>
      <Header title="Voyages" subtitle="50,000+ voyage records across US inland waterways" />
      <div class="page-content fade-in" style={{ 'overflow-y':'auto' }}>
        <div style={{ display:'flex', gap:'10px', 'margin-bottom':'16px', 'align-items':'center' }}>
          <select class="input" style={{ width:'160px', 'font-size':'0.83rem' }} value={statusFilter()} onChange={e => { setStatusFilter(e.currentTarget.value); setPage(1); }}>
            <option value="">All statuses</option>
            {['active','delayed','planned','completed','cancelled'].map(s => <option value={s}>{s}</option>)}
          </select>
          <select class="input" style={{ width:'160px', 'font-size':'0.83rem' }} value={cargoFilter()} onChange={e => { setCargoFilter(e.currentTarget.value); setPage(1); }}>
            <option value="">All cargo</option>
            {['grain','coal','petroleum','chemicals','containers','steel','aggregate','fertilizer','other'].map(c => <option value={c}>{c}</option>)}
          </select>
          <button class="btn btn-ghost btn-sm" onClick={() => { setStatusFilter(''); setCargoFilter(''); setPage(1); }}>Clear</button>
          <button class="btn btn-primary btn-sm" onClick={() => refetch()}>Refresh</button>
          <span style={{ 'font-size':'0.78rem', color:'var(--text-muted)', 'margin-left':'auto' }}>
            Showing {voyages().length} of {totalCount().toLocaleString()} voyages
          </span>
        </div>

        {/* Table */}
        <div class="card">
          <Show when={voyageData.loading}>
            <div style={{ display:'flex', 'justify-content':'center', padding:'60px' }}><div class="spinner"/></div>
          </Show>
          <Show when={!voyageData.loading && voyages().length > 0}>
            <div class="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Voyage</th><th>Vessel</th><th>Route</th><th>Cargo</th>
                    <th>Weight (t)</th><th>Departed</th><th>ETA</th><th>Distance</th><th>Cost</th><th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  <For each={voyages()}>
                    {(v: Voyage) => (
                      <tr onClick={() => setSelected(v)}>
                        <td><code style={{ 'font-family':'var(--font-mono)', 'font-size':'0.76rem', color:'var(--accent)' }}>{v.voyage_number}</code></td>
                        <td style={{ 'font-weight':'500', 'font-size':'0.84rem' }}>{v.barge_name}</td>
                        <td style={{ 'font-size':'0.78rem', color:'var(--text-secondary)', 'font-family':'var(--font-mono)' }}>{v.origin_port_code} → {v.destination_port_code}</td>
                        <td style={{ 'text-transform':'capitalize', 'font-size':'0.82rem' }}>{v.cargo_type}</td>
                        <td style={{ 'font-family':'var(--font-mono)', 'font-size':'0.80rem' }}>{v.cargo_weight_tons?.toLocaleString()}</td>
                        <td style={{ 'font-size':'0.78rem', color:'var(--text-secondary)' }}>{v.departure_date ? format(parseISO(v.departure_date), 'MMM d, yy') : '—'}</td>
                        <td style={{ 'font-size':'0.78rem', color: v.is_delayed ? 'var(--status-delayed)' : 'var(--text-secondary)' }}>
                          {v.estimated_arrival ? format(parseISO(v.estimated_arrival), 'MMM d, yy') : '—'}{v.is_delayed ? ' ⚠' : ''}
                        </td>
                        <td style={{ 'font-family':'var(--font-mono)', 'font-size':'0.78rem' }}>{v.distance_nm ? `${v.distance_nm.toFixed(0)} nm` : '—'}</td>
                        <td style={{ 'font-family':'var(--font-mono)', 'font-size':'0.80rem', color:'var(--gold-700)' }}>${parseFloat(v.total_agreed_cost).toLocaleString()}</td>
                        <td>{badge(v.status)}</td>
                      </tr>
                    )}
                  </For>
                </tbody>
              </table>
            </div>
            <Show when={totalPages() > 1}>
              <div style={{ display:'flex', 'justify-content':'center', 'align-items':'center', gap:'8px', padding:'16px', 'border-top':'1px solid var(--border)' }}>
                <button class="btn btn-ghost btn-sm" disabled={page() === 1} onClick={() => setPage(p => p - 1)}>← Prev</button>
                <span style={{ 'font-size':'0.80rem', color:'var(--text-muted)' }}>Page {page()} of {totalPages()}</span>
                <button class="btn btn-ghost btn-sm" disabled={page() >= totalPages()} onClick={() => setPage(p => p + 1)}>Next →</button>
              </div>
            </Show>
          </Show>
        </div>
      </div>

      {/* Centered modal popup */}
      <Show when={selected()}>
        {(v) => (
          <>
            <div onClick={() => setSelected(null)} style={{ position:'fixed', inset:'0', 'z-index':'1000', background:'rgba(0,0,0,0.4)', 'backdrop-filter':'blur(4px)' }} />
            <div class="fade-in" style={{ position:'fixed', top:'50%', left:'50%', transform:'translate(-50%,-50%)', 'z-index':'1001', background:'var(--bg-card)', 'border-radius':'var(--radius-xl)', padding:'32px 36px', width:'520px', 'max-height':'80vh', 'overflow-y':'auto', 'box-shadow':'var(--shadow-lg)', border:'1px solid var(--border)' }}>
              <div style={{ display:'flex', 'justify-content':'space-between', 'align-items':'flex-start', 'margin-bottom':'20px' }}>
                <div>
                  <code style={{ 'font-family':'var(--font-mono)', color:'var(--accent)', 'font-size':'1rem' }}>{v().voyage_number}</code>
                  <div style={{ 'font-family':'var(--font-display)', 'font-size':'1.3rem', 'margin-top':'4px' }}>{v().barge_name}</div>
                </div>
                <div style={{ display:'flex', 'align-items':'center', gap:'10px' }}>
                  {badge(v().status)}
                  <button onClick={() => setSelected(null)} style={{ background:'none', border:'1px solid var(--border)', cursor:'pointer', color:'var(--text-muted)', 'border-radius':'50%', width:'30px', height:'30px', display:'flex', 'align-items':'center', 'justify-content':'center', 'font-size':'1.1rem' }}>×</button>
                </div>
              </div>

              <div style={{ display:'grid', 'grid-template-columns':'1fr 1fr', gap:'12px', 'margin-bottom':'20px' }}>
                {[
                  ['Origin', `${v().origin_port_name} (${v().origin_port_code})`],
                  ['Destination', `${v().destination_port_name} (${v().destination_port_code})`],
                  ['Cargo', `${v().cargo_type}`],
                  ['Weight', `${v().cargo_weight_tons?.toLocaleString()} tons`],
                  ['Distance', v().distance_nm ? `${v().distance_nm!.toFixed(1)} nm` : '—'],
                  ['Rate', `$${(+v().agreed_rate_per_ton || 0).toFixed(2)}/ton`],
                  ['Fuel surcharge', `$${(+(v().fuel_surcharge||0)).toLocaleString()}`],
                  ['Port fees', `$${(+(v().port_fees_agreed||0)).toLocaleString()}`],
                ].map(([label, val]) => (
                  <div style={{ background:'var(--bg-subtle)', 'border-radius':'var(--radius-md)', padding:'10px 14px' }}>
                    <div style={{ 'font-size':'0.62rem', color:'var(--text-muted)', 'text-transform':'uppercase', 'letter-spacing':'0.07em', 'margin-bottom':'3px' }}>{label}</div>
                    <div style={{ 'font-size':'0.86rem', color:'var(--text-primary)', 'font-weight':'500', 'text-transform':'capitalize' }}>{val}</div>
                  </div>
                ))}
              </div>

              <div style={{ background:'var(--accent-subtle)', 'border-radius':'var(--radius-md)', padding:'14px 18px', 'margin-bottom':'20px', display:'flex', 'justify-content':'space-between', 'align-items':'center' }}>
                <div style={{ 'font-size':'0.72rem', color:'var(--text-muted)', 'text-transform':'uppercase', 'letter-spacing':'0.07em' }}>Total Agreed Cost</div>
                <div style={{ 'font-family':'var(--font-display)', 'font-size':'1.5rem', color:'var(--accent)' }}>${parseFloat(v().total_agreed_cost).toLocaleString()}</div>
              </div>

              <div style={{ display:'grid', 'grid-template-columns':'1fr 1fr', gap:'10px', 'margin-bottom':'20px' }}>
                <div style={{ 'font-size':'0.80rem' }}>
                  <div style={{ color:'var(--text-muted)', 'font-size':'0.68rem', 'text-transform':'uppercase', 'letter-spacing':'0.06em', 'margin-bottom':'3px' }}>Departed</div>
                  <div style={{ 'font-family':'var(--font-mono)' }}>{v().departure_date ? format(parseISO(v().departure_date), 'MMM d yyyy HH:mm') : '—'}</div>
                </div>
                <div style={{ 'font-size':'0.80rem' }}>
                  <div style={{ color: v().is_delayed ? 'var(--status-delayed)' : 'var(--text-muted)', 'font-size':'0.68rem', 'text-transform':'uppercase', 'letter-spacing':'0.06em', 'margin-bottom':'3px' }}>ETA {v().is_delayed ? '⚠ DELAYED' : ''}</div>
                  <div style={{ 'font-family':'var(--font-mono)' }}>{v().estimated_arrival ? format(parseISO(v().estimated_arrival!), 'MMM d yyyy HH:mm') : '—'}</div>
                </div>
              </div>

              <Show when={v().events?.length}>
                <div>
                  <div style={{ 'font-size':'0.68rem', color:'var(--text-muted)', 'text-transform':'uppercase', 'letter-spacing':'0.08em', 'margin-bottom':'10px', 'font-weight':'600' }}>Recent Events</div>
                  <For each={v().events?.slice(0, 4)}>
                    {(ev) => (
                      <div style={{ display:'flex', gap:'10px', 'align-items':'flex-start', 'margin-bottom':'8px', padding:'8px 12px', background:'var(--bg-subtle)', 'border-radius':'var(--radius-md)' }}>
                        <span style={{ width:'7px', height:'7px', 'border-radius':'50%', background:'var(--accent)', 'margin-top':'4px', 'flex-shrink':'0' }}/>
                        <div>
                          <div style={{ 'font-size':'0.80rem', 'font-weight':'500', 'text-transform':'capitalize' }}>{ev.event_type.replace(/_/g,' ')}</div>
                          <div style={{ 'font-size':'0.70rem', color:'var(--text-muted)' }}>{format(parseISO(ev.occurred_at), 'MMM d, HH:mm')}</div>
                        </div>
                      </div>
                    )}
                  </For>
                </div>
              </Show>
            </div>
          </>
        )}
      </Show>
    </div>
  );
};

export default Voyages;
