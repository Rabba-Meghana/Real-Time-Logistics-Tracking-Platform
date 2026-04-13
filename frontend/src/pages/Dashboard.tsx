import { Component, createResource, createEffect, createSignal, onCleanup } from 'solid-js';
import { voyagesApi, invoicesApi, vesselsApi } from '../api';
import Header from '../components/Header';
import * as d3 from 'd3';
import { format } from 'date-fns';

const Dashboard: Component = () => {
  const [voyageStats] = createResource(() => voyagesApi.dashboardStats().then(r => r.data));
  const [invoiceStats] = createResource(() => invoicesApi.dashboardStats().then(r => r.data));
  const [vesselStats] = createResource(() => vesselsApi.stats().then(r => r.data));

  let barRef: SVGSVGElement | undefined;
  let donutRef: SVGSVGElement | undefined;

  createEffect(() => {
    const stats = voyageStats();
    if (!stats) return;
    const monthly = stats.monthly_completed ?? [];
    if (monthly.length && barRef) {
      setTimeout(() => drawBar(monthly), 50);
    }
    if (stats.by_status && donutRef) {
      setTimeout(() => drawDonut(stats.by_status), 50);
    }
  });

  const drawBar = (data: Array<{ month: string; count: number }>) => {
    if (!barRef) return;
    const el = barRef;
    d3.select(el).selectAll('*').remove();
    const w = el.clientWidth || 500, h = 180;
    const m = { top: 16, right: 16, bottom: 32, left: 44 };
    const iw = w - m.left - m.right, ih = h - m.top - m.bottom;
    const svg = d3.select(el).append('g').attr('transform', `translate(${m.left},${m.top})`);
    const x = d3.scaleBand().domain(data.map(d => d.month)).range([0, iw]).padding(0.3);
    const y = d3.scaleLinear().domain([0, d3.max(data, d => d.count) ?? 1]).nice().range([ih, 0]);
    svg.append('g').attr('transform', `translate(0,${ih})`).call(d3.axisBottom(x).tickSize(0))
      .call(g => g.select('.domain').remove())
      .selectAll('text').style('fill', 'var(--text-muted)').style('font-size', '11px').style('font-family', 'var(--font-body)');
    svg.append('g').call(d3.axisLeft(y).ticks(4).tickSize(-iw))
      .call(g => g.select('.domain').remove())
      .call(g => g.selectAll('.tick line').attr('stroke', 'var(--border)').attr('stroke-dasharray', '3,3'))
      .selectAll('text').style('fill', 'var(--text-muted)').style('font-size', '11px');
    svg.selectAll('.bar').data(data).join('rect')
      .attr('x', d => x(d.month) ?? 0).attr('y', ih).attr('width', x.bandwidth()).attr('height', 0)
      .attr('rx', 4).attr('fill', 'var(--accent)').attr('opacity', 0.9)
      .transition().duration(700).ease(d3.easeCubicOut)
      .attr('y', d => y(d.count)).attr('height', d => ih - y(d.count));
  };

  const drawDonut = (data: Record<string, number>) => {
    if (!donutRef) return;
    const el = donutRef;
    d3.select(el).selectAll('*').remove();
    const size = Math.min(el.clientWidth || 180, 180);
    const radius = size / 2 - 12;
    const entries = Object.entries(data).filter(([, v]) => v > 0);
    const colors = ['var(--gold-400)', 'var(--gold-600)', 'var(--status-active)', 'var(--status-planned)', 'var(--text-muted)', 'var(--status-delayed)'];
    const svg = d3.select(el).append('g').attr('transform', `translate(${size / 2},${size / 2})`);
    const pie = d3.pie<[string, number]>().value(d => d[1]).sort(null);
    const arc = d3.arc<d3.PieArcDatum<[string, number]>>().innerRadius(radius * 0.6).outerRadius(radius);
    svg.selectAll('path').data(pie(entries)).join('path')
      .attr('d', arc).attr('fill', (_, i) => colors[i % colors.length])
      .attr('stroke', 'var(--bg-card)').attr('stroke-width', 2)
      .attr('opacity', 0).transition().duration(600).delay((_, i) => i * 60).attr('opacity', 1);
    const total = entries.reduce((s, [, v]) => s + v, 0);
    svg.append('text').attr('text-anchor', 'middle').attr('dy', '-0.1em')
      .style('font-family', 'var(--font-display)').style('font-size', '1.4rem').style('fill', 'var(--text-primary)').text(total.toLocaleString());
    svg.append('text').attr('text-anchor', 'middle').attr('dy', '1.2em')
      .style('font-size', '9px').style('fill', 'var(--text-muted)').style('font-family', 'var(--font-body)')
      .style('letter-spacing', '0.06em').style('text-transform', 'uppercase').text('voyages');
  };

  return (
    <div style={{ display: 'flex', 'flex-direction': 'column', height: '100%' }}>
      <Header title="Dashboard" subtitle={`${format(new Date(), 'EEEE, MMMM d yyyy')} · Real-time logistics overview`} />
      <div class="page-content fade-in">

        <div class="stat-grid">
          <StatCard label="Active Voyages" value={voyageStats()?.active_voyages?.toLocaleString() ?? '—'} sub={`${voyageStats()?.delayed_voyages ?? 0} delayed`} color="var(--status-active)" />
          <StatCard label="Completed (30d)" value={voyageStats()?.completed_last_30d ?? '—'} sub={`Avg ${voyageStats()?.avg_distance_nm?.toFixed(0) ?? '—'} nm`} />
          <StatCard label="Revenue (30d)" value={`$${((voyageStats()?.revenue_last_30d ?? 0) / 1000).toFixed(0)}k`} sub="from completed voyages" color="var(--gold-600)" />
          <StatCard label="Cargo Moved" value={`${((voyageStats()?.total_cargo_tons ?? 0) / 1000).toFixed(0)}k`} sub="tons in transit" />
          <StatCard label="Vessels Tracked" value={vesselStats()?.total_vessels ?? '—'} sub={`${vesselStats()?.active_last_hour ?? 0} reported last hour`} color="var(--status-planned)" />
          <StatCard label="Invoices Pending" value={invoiceStats()?.needs_review ?? '—'} sub={`Avg confidence ${Math.round((invoiceStats()?.avg_confidence_score ?? 0) * 100)}%`} color={(invoiceStats()?.needs_review ?? 0) > 0 ? 'var(--status-delayed)' : undefined} />
        </div>

        <div style={{ display: 'grid', 'grid-template-columns': '1fr 200px', gap: '18px', 'margin-bottom': '20px' }}>
          <div class="card">
            <div class="card-header">
              <span style={{ 'font-family': 'var(--font-display)', 'font-size': '1rem' }}>Completed Voyages — Last 6 Months</span>
            </div>
            <div style={{ padding: '12px 16px 16px' }}>
              <svg ref={el => { barRef = el; }} style={{ width: '100%', height: '180px', display: 'block' }} />
            </div>
          </div>
          <div class="card" style={{ display: 'flex', 'flex-direction': 'column', 'align-items': 'center', padding: '16px' }}>
            <div style={{ 'font-family': 'var(--font-display)', 'font-size': '0.9rem', 'margin-bottom': '10px', 'align-self': 'flex-start' }}>By Status</div>
            <svg ref={el => { donutRef = el; }} style={{ width: '160px', height: '160px' }} />
            <div style={{ display: 'flex', 'flex-direction': 'column', gap: '4px', 'margin-top': '10px', width: '100%' }}>
              {Object.entries(voyageStats()?.by_status ?? {}).map(([status, count]) => (
                <div style={{ display: 'flex', 'justify-content': 'space-between', 'font-size': '0.76rem' }}>
                  <span style={{ color: 'var(--text-secondary)', 'text-transform': 'capitalize' }}>{status}</span>
                  <span class={`badge badge-${status}`}>{String(count)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', 'grid-template-columns': '1fr 1fr', gap: '18px' }}>
          <div class="card">
            <div class="card-header"><span style={{ 'font-family': 'var(--font-display)', 'font-size': '1rem' }}>Invoice Validation</span></div>
            <div class="card-body">
              {Object.entries(invoiceStats()?.by_status ?? {}).map(([status, count]) => (
                <div style={{ display: 'flex', 'justify-content': 'space-between', 'align-items': 'center', padding: '6px 0', 'border-bottom': '1px solid var(--border)' }}>
                  <span style={{ 'font-size': '0.82rem', color: 'var(--text-secondary)', 'text-transform': 'capitalize' }}>{status.replace(/_/g, ' ')}</span>
                  <span class={`badge badge-${status}`}>{String(count)}</span>
                </div>
              ))}
              <div style={{ 'margin-top': '10px', 'font-size': '0.76rem', color: 'var(--text-muted)' }}>
                Total invoice value: <strong style={{ color: 'var(--text-primary)' }}>${((invoiceStats()?.total_invoice_value ?? 0) / 1000000).toFixed(2)}M</strong>
              </div>
            </div>
          </div>

          <div class="card">
            <div class="card-header"><span style={{ 'font-family': 'var(--font-display)', 'font-size': '1rem' }}>Cargo Mix</span></div>
            <div class="card-body">
              {Object.entries(voyageStats()?.by_cargo_type ?? {})
                .sort(([, a], [, b]) => (b as number) - (a as number))
                .map(([cargo, count]) => {
                  const total = Object.values(voyageStats()?.by_cargo_type ?? {}).reduce((s, v) => s + (v as number), 0);
                  const pct = total ? Math.round((count as number) / total * 100) : 0;
                  return (
                    <div style={{ 'margin-bottom': '9px' }}>
                      <div style={{ display: 'flex', 'justify-content': 'space-between', 'font-size': '0.78rem', 'margin-bottom': '3px' }}>
                        <span style={{ color: 'var(--text-secondary)', 'text-transform': 'capitalize' }}>{cargo}</span>
                        <span style={{ color: 'var(--text-muted)' }}>{pct}%</span>
                      </div>
                      <div style={{ height: '5px', background: 'var(--border)', 'border-radius': '3px', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${pct}%`, background: 'var(--accent)', 'border-radius': '3px', transition: 'width 0.8s ease' }} />
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

interface StatCardProps { label: string; value: string | number; sub?: string; color?: string; }
const StatCard: Component<StatCardProps> = (props) => (
  <div class="stat-card">
    <div class="stat-label">{props.label}</div>
    <div class="stat-value" style={props.color ? { color: props.color } : {}}>{props.value}</div>
    {props.sub && <div class="stat-sub">{props.sub}</div>}
  </div>
);

export default Dashboard;
