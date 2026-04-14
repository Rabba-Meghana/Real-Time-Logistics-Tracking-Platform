import { Component, createResource, createSignal, For, Show } from 'solid-js';
import { invoicesApi } from '../api';
import Header from '../components/Header';
import type { Invoice, Discrepancy } from '../types';
import { format, parseISO } from 'date-fns';

const Invoices: Component = () => {
  const [statusFilter, setStatusFilter] = createSignal('');
  const [selected, setSelected] = createSignal<Invoice | null>(null);
  const [actionLoading, setActionLoading] = createSignal(false);
  const [llmSummary, setLlmSummary] = createSignal<string | null>(null);
  const [llmLoading, setLlmLoading] = createSignal(false);

  const [invoices, { refetch }] = createResource(
    () => statusFilter(),
    (status) => {
      const params: Record<string, string> = {};
      if (status) params.validation_status = status;
      return invoicesApi.list(params).then(r => r.data);
    }
  );

  const [stats] = createResource(() => invoicesApi.dashboardStats().then(r => r.data));

  const approve = async (inv: Invoice) => {
    setActionLoading(true);
    await invoicesApi.approve(inv.id, 'operations-team');
    refetch(); setSelected(null); setActionLoading(false);
  };
  const reject = async (inv: Invoice) => {
    setActionLoading(true);
    await invoicesApi.reject(inv.id);
    refetch(); setSelected(null); setActionLoading(false);
  };
  const revalidate = async (inv: Invoice) => {
    setActionLoading(true);
    await invoicesApi.revalidate(inv.id);
    refetch(); setActionLoading(false);
  };

  const openInvoice = async (inv: Invoice) => {
    setSelected(inv);
    setLlmSummary(null);
    setLlmLoading(true);
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1000,
          messages: [{
            role: 'user',
            content: `Summarize this freight invoice in 2-3 sentences for an operations manager. Be concise and highlight any risks.

Invoice: ${inv.invoice_number}
Vendor: ${inv.vendor_name}
Voyage: ${inv.voyage_number}
Amount: $${parseFloat(inv.total_amount).toLocaleString()}
LLM Confidence: ${Math.round((inv.confidence_score ?? 0) * 100)}%
Status: ${inv.validation_status}
Discrepancies: ${inv.discrepancy_count}
Notes: ${inv.validation_notes || 'none'}`
          }]
        })
      });
      const data = await res.json();
      const text = data.content?.[0]?.text ?? '';
      setLlmSummary(text);
    } catch {
      setLlmSummary('Summary unavailable.');
    }
    setLlmLoading(false);
  };

  const confBar = (score: number | null) => {
    if (score == null) return null;
    const pct = Math.round(score * 100);
    const color = pct >= 85 ? 'var(--status-active)' : pct >= 70 ? 'var(--gold-500)' : 'var(--status-delayed)';
    return (
      <div style={{ display:'flex', 'align-items':'center', gap:'6px' }}>
        <div style={{ flex:'1', height:'4px', background:'var(--border)', 'border-radius':'2px' }}>
          <div style={{ height:'100%', width:`${pct}%`, background:color, 'border-radius':'2px', transition:'width 0.6s ease' }}/>
        </div>
        <span style={{ 'font-size':'0.70rem', 'font-family':'var(--font-mono)', color:'var(--text-muted)', 'min-width':'30px' }}>{pct}%</span>
      </div>
    );
  };

  return (
    <div style={{ display:'flex', 'flex-direction':'column', height:'100%' }}>
      <Header title="Invoice Validation" subtitle="LLM-powered invoice validation against voyage records" />
      <div class="page-content fade-in" style={{ 'overflow-y':'auto' }}>

        <Show when={stats()}>
          <div style={{ display:'flex', gap:'12px', 'margin-bottom':'16px', 'flex-wrap':'wrap' }}>
            {[
              ['Total', stats()!.total_invoices, ''],
              ['Needs Review', stats()!.needs_review, 'var(--status-delayed)'],
              ['Avg Confidence', `${Math.round((stats()!.avg_confidence_score ?? 0)*100)}%`, 'var(--gold-600)'],
              ['Total Value', `$${((stats()!.total_invoice_value ?? 0)/1000000).toFixed(2)}M`, ''],
            ].map(([label, val, color]) => (
              <div class="card" style={{ padding:'12px 18px', 'flex-shrink':'0' }}>
                <div style={{ 'font-size':'0.65rem', color:'var(--text-muted)', 'text-transform':'uppercase', 'letter-spacing':'0.07em', 'margin-bottom':'2px' }}>{label}</div>
                <div style={{ 'font-family':'var(--font-display)', 'font-size':'1.4rem', color: color || 'var(--text-primary)' }}>{val}</div>
              </div>
            ))}
          </div>
        </Show>

        <div style={{ display:'flex', gap:'10px', 'margin-bottom':'14px' }}>
          <select
            class="input"
            style={{ width:'200px', 'font-size':'0.83rem' }}
            value={statusFilter()}
            onInput={e => setStatusFilter(e.currentTarget.value)}
          >
            <option value="">All statuses</option>
            {['pending','validating','valid','invalid','needs_review','approved','rejected'].map(s => (
              <option value={s}>{s.replace(/_/g,' ')}</option>
            ))}
          </select>
          <button class="btn btn-primary btn-sm" onClick={() => refetch()}>Refresh</button>
        </div>

        <div class="card">
          <Show when={invoices.loading}>
            <div style={{ display:'flex', 'justify-content':'center', padding:'60px' }}><div class="spinner"/></div>
          </Show>
          <Show when={!invoices.loading && invoices()}>
            <div class="table-wrap">
              <table>
                <thead>
                  <tr><th>Invoice #</th><th>Vendor</th><th>Voyage</th><th>Total</th><th>Confidence</th><th>Discrepancies</th><th>Validated</th><th>Status</th></tr>
                </thead>
                <tbody>
                  <For each={(invoices() as any)?.results ?? invoices()}>
                    {(inv: Invoice) => (
                      <tr onClick={() => openInvoice(inv)}>
                        <td><code style={{ 'font-family':'var(--font-mono)', 'font-size':'0.76rem', color:'var(--accent)' }}>{inv.invoice_number}</code></td>
                        <td style={{ 'font-size':'0.82rem' }}>{inv.vendor_name}</td>
                        <td style={{ 'font-size':'0.76rem', color:'var(--text-secondary)', 'font-family':'var(--font-mono)' }}>{inv.voyage_number}</td>
                        <td style={{ 'font-family':'var(--font-mono)', 'font-size':'0.82rem' }}>${parseFloat(inv.total_amount).toLocaleString()}</td>
                        <td style={{ 'min-width':'120px' }}>{confBar(inv.confidence_score)}</td>
                        <td style={{ 'text-align':'center' }}>
                          {inv.discrepancy_count > 0
                            ? <span class={`badge badge-${inv.has_critical_discrepancy ? 'critical' : 'high'}`}>{inv.discrepancy_count}</span>
                            : <span style={{ color:'var(--text-muted)', 'font-size':'0.76rem' }}>none</span>}
                        </td>
                        <td style={{ 'font-size':'0.76rem', color:'var(--text-muted)' }}>{inv.validated_at ? format(parseISO(inv.validated_at), 'MMM d, HH:mm') : '—'}</td>
                        <td><span class={`badge badge-${inv.validation_status}`}>{inv.validation_status.replace(/_/g,' ')}</span></td>
                      </tr>
                    )}
                  </For>
                </tbody>
              </table>
            </div>
          </Show>
        </div>
      </div>

      <Show when={selected()}>
        {(inv) => (
          <>
            <div onClick={() => setSelected(null)} style={{ position:'fixed', inset:'0', 'z-index':'1000', background:'rgba(0,0,0,0.4)', 'backdrop-filter':'blur(4px)' }}/>
            <div class="fade-in" style={{ position:'fixed', top:'50%', left:'50%', transform:'translate(-50%,-50%)', 'z-index':'1001', background:'var(--bg-card)', 'border-radius':'var(--radius-xl)', padding:'32px 36px', width:'560px', 'max-height':'85vh', 'overflow-y':'auto', 'box-shadow':'var(--shadow-lg)', border:'1px solid var(--border)' }}>
              <div style={{ display:'flex', 'justify-content':'space-between', 'align-items':'flex-start', 'margin-bottom':'20px' }}>
                <div>
                  <code style={{ 'font-family':'var(--font-mono)', color:'var(--accent)', 'font-size':'0.95rem' }}>{inv().invoice_number}</code>
                  <div style={{ 'font-family':'var(--font-display)', 'font-size':'1.2rem', 'margin-top':'4px' }}>{inv().vendor_name}</div>
                  <div style={{ 'font-size':'0.74rem', color:'var(--text-muted)', 'margin-top':'2px' }}>Voyage: {inv().voyage_number}</div>
                </div>
                <div style={{ display:'flex', 'align-items':'center', gap:'10px' }}>
                  <span class={`badge badge-${inv().validation_status}`} style={{ 'font-size':'0.76rem' }}>{inv().validation_status.replace(/_/g,' ')}</span>
                  <button onClick={() => setSelected(null)} style={{ background:'none', border:'1px solid var(--border)', cursor:'pointer', color:'var(--text-muted)', 'border-radius':'50%', width:'30px', height:'30px', display:'flex', 'align-items':'center', 'justify-content':'center', 'font-size':'1.1rem' }}>×</button>
                </div>
              </div>

              {/* LLM Summary */}
              <div style={{ background:'var(--accent-subtle)', border:'1px solid var(--border)', 'border-radius':'var(--radius-lg)', padding:'14px 18px', 'margin-bottom':'18px' }}>
                <div style={{ 'font-size':'0.65rem', color:'var(--accent)', 'text-transform':'uppercase', 'letter-spacing':'0.07em', 'margin-bottom':'6px', 'font-weight':'700' }}>⚡ AI Summary</div>
                <Show when={!llmLoading()} fallback={<div style={{ display:'flex', 'align-items':'center', gap:'8px', color:'var(--text-muted)', 'font-size':'0.82rem' }}><div class="spinner" style={{ width:'14px', height:'14px' }}/> Analyzing invoice…</div>}>
                  <div style={{ 'font-size':'0.82rem', color:'var(--text-primary)', 'line-height':'1.55' }}>{llmSummary()}</div>
                </Show>
              </div>

              {/* LLM confidence */}
              <div style={{ background:'var(--bg-subtle)', 'border-radius':'var(--radius-lg)', padding:'16px 20px', 'margin-bottom':'20px' }}>
                <div style={{ display:'flex', 'justify-content':'space-between', 'align-items':'center', 'margin-bottom':'10px' }}>
                  <div>
                    <div style={{ 'font-size':'0.68rem', color:'var(--text-muted)', 'text-transform':'uppercase', 'letter-spacing':'0.07em', 'margin-bottom':'2px' }}>LLM Confidence Score</div>
                    <div style={{ 'font-family':'var(--font-display)', 'font-size':'1.6rem', color: (inv().confidence_score ?? 0) >= 0.85 ? 'var(--status-active)' : (inv().confidence_score ?? 0) >= 0.70 ? 'var(--gold-600)' : 'var(--status-delayed)' }}>
                      {Math.round((inv().confidence_score ?? 0) * 100)}%
                    </div>
                  </div>
                  <div style={{ 'text-align':'right' }}>
                    <div style={{ 'font-size':'0.65rem', color:'var(--text-muted)', 'margin-bottom':'2px' }}>Model</div>
                    <code style={{ 'font-family':'var(--font-mono)', 'font-size':'0.76rem', color:'var(--accent)' }}>{inv().validation_model || 'rule-based'}</code>
                  </div>
                </div>
                {confBar(inv().confidence_score)}
                {inv().validation_notes && (
                  <div style={{ 'margin-top':'10px', 'font-size':'0.78rem', color:'var(--text-secondary)', 'line-height':'1.5' }}>{inv().validation_notes}</div>
                )}
              </div>

              {/* Financials */}
              <div style={{ display:'grid', 'grid-template-columns':'1fr 1fr 1fr', gap:'10px', 'margin-bottom':'20px' }}>
                {[['Subtotal', `$${parseFloat(inv().subtotal).toLocaleString()}`],
                  ['Tax', `$${parseFloat(inv().tax_amount).toLocaleString()}`],
                  ['Total', `$${parseFloat(inv().total_amount).toLocaleString()}`]
                ].map(([label, val]) => (
                  <div style={{ background:'var(--bg-subtle)', 'border-radius':'var(--radius-md)', padding:'10px 14px' }}>
                    <div style={{ 'font-size':'0.62rem', color:'var(--text-muted)', 'text-transform':'uppercase', 'letter-spacing':'0.07em', 'margin-bottom':'3px' }}>{label}</div>
                    <div style={{ 'font-family':'var(--font-mono)', 'font-size':'0.92rem', color:'var(--text-primary)', 'font-weight':'600' }}>{val}</div>
                  </div>
                ))}
              </div>

              {/* Discrepancies */}
              <Show when={inv().discrepancies?.length > 0}>
                <div style={{ 'margin-bottom':'20px' }}>
                  <div style={{ 'font-size':'0.68rem', color:'var(--text-muted)', 'text-transform':'uppercase', 'letter-spacing':'0.07em', 'margin-bottom':'10px', 'font-weight':'700' }}>
                    Discrepancies Found ({inv().discrepancies.length})
                  </div>
                  <For each={inv().discrepancies as Discrepancy[]}>
                    {(d) => (
                      <div style={{ background:'var(--bg-subtle)', border:`1px solid ${d.severity === 'critical' ? 'var(--status-delayed-bg)' : 'var(--border)'}`, 'border-radius':'var(--radius-md)', padding:'12px 16px', 'margin-bottom':'8px' }}>
                        <div style={{ display:'flex', 'justify-content':'space-between', 'margin-bottom':'8px' }}>
                          <span style={{ 'font-size':'0.84rem', 'font-weight':'600', 'text-transform':'capitalize' }}>{d.field.replace(/_/g,' ')}</span>
                          <span class={`badge badge-${d.severity}`}>{d.severity}</span>
                        </div>
                        <div style={{ display:'grid', 'grid-template-columns':'1fr 1fr', gap:'8px', 'margin-bottom':'6px' }}>
                          <div style={{ 'font-size':'0.74rem' }}>
                            <span style={{ color:'var(--text-muted)' }}>Invoice: </span>
                            <code style={{ 'font-family':'var(--font-mono)', color:'var(--status-delayed)' }}>{d.invoice_value}</code>
                          </div>
                          <div style={{ 'font-size':'0.74rem' }}>
                            <span style={{ color:'var(--text-muted)' }}>Expected: </span>
                            <code style={{ 'font-family':'var(--font-mono)', color:'var(--status-active)' }}>{d.voyage_value}</code>
                          </div>
                        </div>
                        <div style={{ 'font-size':'0.72rem', color:'var(--text-secondary)' }}>{d.description}</div>
                      </div>
                    )}
                  </For>
                </div>
              </Show>

              <Show when={['needs_review','invalid','valid'].includes(inv().validation_status)}>
                <div style={{ display:'flex', gap:'8px' }}>
                  <button class="btn btn-primary" style={{ flex:'1', 'justify-content':'center' }} disabled={actionLoading()} onClick={() => approve(inv())}>
                    {actionLoading() ? '…' : '✓ Approve'}
                  </button>
                  <button class="btn btn-ghost" style={{ flex:'1', 'justify-content':'center', 'border-color':'var(--status-delayed)', color:'var(--status-delayed)' }} disabled={actionLoading()} onClick={() => reject(inv())}>
                    ✗ Reject
                  </button>
                  <button class="btn btn-ghost" style={{ 'justify-content':'center', padding:'8px 16px' }} disabled={actionLoading()} onClick={() => revalidate(inv())}>
                    ↻
                  </button>
                </div>
              </Show>
            </div>
          </>
        )}
      </Show>
    </div>
  );
};

export default Invoices;
