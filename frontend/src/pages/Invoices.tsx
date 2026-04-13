import { Component, createResource, createSignal, For, Show } from 'solid-js';
import { invoicesApi } from '../api';
import Header from '../components/Header';
import type { Invoice, Discrepancy } from '../types';
import { format, parseISO } from 'date-fns';

const Invoices: Component = () => {
  const [statusFilter, setStatusFilter] = createSignal('');
  const [selected, setSelected] = createSignal<Invoice | null>(null);
  const [actionLoading, setActionLoading] = createSignal(false);

  const [invoices, { refetch }] = createResource(
    () => statusFilter(),
    (status) => {
      const params: Record<string, string> = {};
      if (status) params.validation_status = status;
      return invoicesApi.list(params).then(r => r.data);
    }
  );

  const [stats] = createResource(() => invoicesApi.dashboardStats().then(r => r.data));

  const approve = async (invoice: Invoice) => {
    setActionLoading(true);
    await invoicesApi.approve(invoice.id, 'operations-team');
    refetch();
    setSelected(null);
    setActionLoading(false);
  };

  const reject = async (invoice: Invoice) => {
    setActionLoading(true);
    await invoicesApi.reject(invoice.id);
    refetch();
    setSelected(null);
    setActionLoading(false);
  };

  const revalidate = async (invoice: Invoice) => {
    setActionLoading(true);
    await invoicesApi.revalidate(invoice.id);
    refetch();
    setActionLoading(false);
  };

  const confidenceBar = (score: number | null) => {
    if (score == null) return null;
    const pct = Math.round(score * 100);
    const color = pct >= 85 ? 'var(--status-active)' : pct >= 70 ? 'var(--gold-500)' : 'var(--status-delayed)';
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <div style={{ flex: '1', height: '4px', background: 'var(--border)', borderRadius: '2px' }}>
          <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: '2px', transition: 'width 0.6s ease' }} />
        </div>
        <span style={{ fontSize: '0.72rem', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', minWidth: '32px' }}>{pct}%</span>
      </div>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Header title="Invoice Validation" subtitle="LLM-powered invoice validation against voyage records" />
      <div class="page-content fade-in" style={{ display: 'flex', gap: '20px', overflow: 'hidden', flex: '1', padding: '24px 28px' }}>

        {/* Left: table */}
        <div style={{ flex: '1', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

          {/* Stats strip */}
          <Show when={stats()}>
            <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', flexShrink: '0' }}>
              {[
                ['Total', stats()!.total_invoices, ''],
                ['Needs Review', stats()!.needs_review, 'var(--status-delayed)'],
                ['Avg Confidence', `${Math.round((stats()!.avg_confidence_score ?? 0) * 100)}%`, 'var(--gold-600)'],
                ['Total Value', `$${((stats()!.total_invoice_value ?? 0) / 1000000).toFixed(2)}M`, ''],
              ].map(([label, val, color]) => (
                <div class="card" style={{ padding: '10px 16px', flexShrink: '0' }}>
                  <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{label}</div>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.3rem', color: color || 'var(--text-primary)' }}>{val}</div>
                </div>
              ))}
            </div>
          </Show>

          <div style={{ display: 'flex', gap: '10px', marginBottom: '12px', flexShrink: '0' }}>
            <select class="input" style={{ width: '190px', fontSize: '0.83rem' }} value={statusFilter()} onChange={e => setStatusFilter(e.currentTarget.value)}>
              <option value="">All statuses</option>
              {['pending','validating','valid','invalid','needs_review','approved','rejected'].map(s => (
                <option value={s}>{s.replace(/_/g, ' ')}</option>
              ))}
            </select>
            <button class="btn btn-primary btn-sm" onClick={() => refetch()}>Refresh</button>
          </div>

          <div class="card" style={{ flex: '1', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div class="table-wrap" style={{ flex: '1', overflow: 'auto' }}>
              <Show when={invoices.loading}>
                <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}><div class="spinner" /></div>
              </Show>
              <Show when={!invoices.loading && invoices()}>
                <table>
                  <thead>
                    <tr>
                      <th>Invoice #</th>
                      <th>Vendor</th>
                      <th>Voyage</th>
                      <th>Total</th>
                      <th>Confidence</th>
                      <th>Discrepancies</th>
                      <th>Validated</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    <For each={invoices()?.results ?? invoices()}>
                      {(inv: Invoice) => (
                        <tr onClick={() => setSelected(inv)} style={selected()?.id === inv.id ? { background: 'var(--accent-subtle)' } : {}}>
                          <td><code style={{ fontSize: '0.78rem', fontFamily: 'var(--font-mono)', color: 'var(--accent)' }}>{inv.invoice_number}</code></td>
                          <td style={{ fontSize: '0.83rem' }}>{inv.vendor_name}</td>
                          <td style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>{inv.voyage_number}</td>
                          <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.82rem' }}>${parseFloat(inv.total_amount).toLocaleString()}</td>
                          <td style={{ minWidth: '120px' }}>{confidenceBar(inv.confidence_score)}</td>
                          <td style={{ textAlign: 'center' }}>
                            {inv.discrepancy_count > 0
                              ? <span class={`badge badge-${inv.has_critical_discrepancy ? 'critical' : 'high'}`}>{inv.discrepancy_count}</span>
                              : <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>none</span>
                            }
                          </td>
                          <td style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                            {inv.validated_at ? format(parseISO(inv.validated_at), 'MMM d, HH:mm') : '—'}
                          </td>
                          <td><span class={`badge badge-${inv.validation_status}`}>{inv.validation_status.replace(/_/g, ' ')}</span></td>
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
          {(invoice) => (
            <div class="card fade-in" style={{ width: '340px', flexShrink: '0', overflow: 'auto', alignSelf: 'flex-start', maxHeight: '100%' }}>
              <div class="card-header">
                <span style={{ fontFamily: 'var(--font-display)', fontSize: '1rem' }}>Invoice Detail</span>
                <button class="btn btn-ghost btn-sm" onClick={() => setSelected(null)}>×</button>
              </div>
              <div class="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <code style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent)' }}>{invoice().invoice_number}</code>
                  <span class={`badge badge-${invoice().validation_status}`}>{invoice().validation_status.replace(/_/g, ' ')}</span>
                </div>

                <div>
                  <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '4px' }}>LLM Confidence</div>
                  {confidenceBar(invoice().confidence_score)}
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '4px' }}>Model: {invoice().validation_model || 'rule-based'}</div>
                </div>

                {invoice().validation_notes && (
                  <div style={{ background: 'var(--bg-subtle)', borderRadius: 'var(--radius-md)', padding: '10px 12px', fontSize: '0.80rem', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>
                    {invoice().validation_notes}
                  </div>
                )}

                <Show when={invoice().discrepancies?.length > 0}>
                  <div>
                    <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '8px' }}>
                      Discrepancies ({invoice().discrepancies.length})
                    </div>
                    <For each={invoice().discrepancies as Discrepancy[]}>
                      {(d) => (
                        <div style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '10px 12px', marginBottom: '8px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                            <span style={{ fontSize: '0.80rem', fontWeight: '600', textTransform: 'capitalize' }}>{d.field.replace(/_/g, ' ')}</span>
                            <span class={`badge badge-${d.severity}`}>{d.severity}</span>
                          </div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '3px' }}>Invoice: <code style={{ fontFamily: 'var(--font-mono)' }}>{d.invoice_value}</code></div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Expected: <code style={{ fontFamily: 'var(--font-mono)' }}>{d.voyage_value}</code></div>
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '5px' }}>{d.description}</div>
                        </div>
                      )}
                    </For>
                  </div>
                </Show>

                <Show when={['needs_review', 'invalid', 'valid'].includes(invoice().validation_status)}>
                  <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                    <button
                      class="btn btn-primary btn-sm"
                      style={{ flex: '1', justifyContent: 'center' }}
                      disabled={actionLoading()}
                      onClick={() => approve(invoice())}
                    >
                      {actionLoading() ? '…' : '✓ Approve'}
                    </button>
                    <button
                      class="btn btn-ghost btn-sm"
                      style={{ flex: '1', justifyContent: 'center', borderColor: 'var(--status-delayed)', color: 'var(--status-delayed)' }}
                      disabled={actionLoading()}
                      onClick={() => reject(invoice())}
                    >
                      ✗ Reject
                    </button>
                  </div>
                  <button
                    class="btn btn-ghost btn-sm"
                    style={{ width: '100%', justifyContent: 'center' }}
                    disabled={actionLoading()}
                    onClick={() => revalidate(invoice())}
                  >
                    ↻ Re-validate
                  </button>
                </Show>
              </div>
            </div>
          )}
        </Show>
      </div>
    </div>
  );
};

export default Invoices;
