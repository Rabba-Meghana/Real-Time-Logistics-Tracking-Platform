import { Component, createResource, onMount, onCleanup, createSignal } from 'solid-js';
import { voyagesApi, invoicesApi, observabilityApi, vesselsApi } from '../api';
import Header from '../components/Header';
import * as d3 from 'd3';
import { format } from 'date-fns';

const Dashboard: Component = () => {
  const [voyageStats] = createResource(() => voyagesApi.dashboardStats().then(r => r.data));
  const [invoiceStats] = createResource(() => invoicesApi.dashboardStats().then(r => r.data));
  const [vesselStats] = createResource(() => vesselsApi.stats().then(r => r.data));
  const [metrics] = createResource(() => observabilityApi.metrics().then(r => r.data));

  let barChartRef: SVGSVGElement | undefined;
  let donutRef: SVGSVGElement | undefined;
  let sparkRef: SVGSVGElement | undefined;
  let metricsInterval: ReturnType<typeof setInterval>;

  onMount(() => {
    metricsInterval = setInterval(() => {}, 30000);
  });
  onCleanup(() => clearInterval(metricsInterval));

  const drawBarChart = (data: Array<{ month: string; count: number }>) => {
    if (!barChartRef || !data?.length) return;
    const el = barChartRef;
    d3.select(el).selectAll('*').remove();
    const w = el.clientWidth || 520, h = el.clientHeight || 200;
    const margin = { top: 16, right: 16, bottom: 32, left: 40 };
    const iw = w - margin.left - margin.right;
    const ih = h - margin.top - margin.bottom;

    const svg = d3.select(el)
      .append('g').attr('transform', `translate(${margin.left},${margin.top})`);

    const x = d3.scaleBand().domain(data.map(d => d.month)).range([0, iw]).padding(0.28);
    const y = d3.scaleLinear().domain([0, d3.max(data, d => d.count) ?? 1]).nice().range([ih, 0]);

    const accentColor = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();

    svg.append('g').attr('transform', `translate(0,${ih})`)
      .call(d3.axisBottom(x).tickSize(0))
      .call(g => g.select('.domain').remove())
      .selectAll('text')
      .attr('fill', 'var(--text-muted)')
      .style('font-size', '11px')
      .style('font-family', 'var(--font-body)');

    svg.append('g')
      .call(d3.axisLeft(y).ticks(4).tickSize(-iw))
      .call(g => g.select('.domain').remove())
      .call(g => g.selectAll('.tick line').attr('stroke', 'var(--border)').attr('stroke-dasharray', '3,3'))
      .selectAll('text')
      .attr('fill', 'var(--text-muted)')
      .style('font-size', '11px')
      .style('font-family', 'var(--font-body)');

    svg.selectAll('.bar')
      .data(data)
      .join('rect')
      .attr('class', 'bar')
      .attr('x', d => x(d.month) ?? 0)
      .attr('y', ih)
      .attr('width', x.bandwidth())
      .attr('height', 0)
      .attr('rx', 4)
      .attr('fill', accentColor)
      .attr('opacity', 0.85)
      .transition().duration(700).ease(d3.easeCubicOut)
      .attr('y', d => y(d.count))
      .attr('height', d => ih - y(d.count));
  };

  const drawDonut = (data: Record<string, number>) => {
    if (!donutRef || !data) return;
    const el = donutRef;
    d3.select(el).selectAll('*').remove();
    const size = el.clientWidth || 180;
    const radius = (size / 2) - 16;
    const entries = Object.entries(data).filter(([, v]) => v > 0);

    const colors = [
      'var(--gold-400)', 'var(--gold-600)', 'var(--status-active)',
      'var(--status-planned)', 'var(--text-muted)', 'var(--status-delayed)',
    ];

    const svg = d3.select(el).append('g').attr('transform', `translate(${size / 2},${size / 2})`);
    const pie = d3.pie<[string, number]>().value(d => d[1]).sort(null);
    const arc = d3.arc<d3.PieArcDatum<[string, number]>>()
      .innerRadius(radius * 0.62).outerRadius(radius);

    svg.selectAll('path')
      .data(pie(entries))
      .join('path')
      .attr('d', arc)
      .attr('fill', (_, i) => colors[i % colors.length])
      .attr('stroke', 'var(--bg-card)')
      .attr('stroke-width', 2)
      .attr('opacity', 0)
      .transition().duration(600).delay((_, i) => i * 80)
      .attr('opacity', 1);

    const total = entries.reduce((s, [, v]) => s + v, 0);
    svg.append('text').attr('text-anchor', 'middle').attr('dy', '-0.15em')
      .style('font-family', 'var(--font-display)').style('font-size', '1.5rem')
      .style('fill', 'var(--text-primary)').text(total.toLocaleString());
    svg.append('text').attr('text-anchor', 'middle').attr('dy', '1.2em')
      .style('font-size', '10px').style('fill', 'var(--text-muted)')
      .style('font-family', 'var(--font-body)').style('letter-spacing', '0.06em')
      .style('text-transform', 'uppercase').text('voyages');
  };

  const drawSparkline = (data: Array<{ month: string; count: number }>) => {
    if (!sparkRef || !data?.length) return;
    const el = sparkRef;
    d3.select(el).selectAll('*').remove();
    const w = el.clientWidth || 200, h = 40;
    const x = d3.scaleLinear().domain([0, data.length - 1]).range([0, w]);
    const y = d3.scaleLinear().domain([0, d3.max(data, d => d.count) ?? 1]).range([h, 0]);
    const line = d3.line<{ month: string; count: number }>()
      .x((_, i) => x(i)).y(d => y(d.count)).curve(d3.curveCatmullRom);

    const svg = d3.select(el);
    const area = d3.area<{ month: string; count: number }>()
      .x((_, i) => x(i)).y0(h).y1(d => y(d.count)).curve(d3.curveCatmullRom);

    svg.append('path').datum(data).attr('d', area)
      .attr('fill', 'var(--accent)').attr('opacity', 0.12);
    svg.append('path').datum(data).attr('d', line)
      .attr('fill', 'none').attr('stroke', 'var(--accent)')
      .attr('stroke-width', 2).attr('stroke-linejoin', 'round');
  };

  // Draw charts when data loads
  const [chartsDrawn, setChartsDrawn] = createSignal(false);
  const tryDrawCharts = () => {
    const stats = voyageStats();
    if (!stats || chartsDrawn()) return;
    setTimeout(() => {
      drawBarChart(stats.monthly_completed ?? []);
      drawDonut(stats.by_status ?? {});
      drawSparkline(stats.monthly_completed ?? []);
      setChartsDrawn(true);
    }, 100);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Header title="Dashboard" subtitle={`${format(new Date(), 'EEEE, MMMM d yyyy')} · Real-time logistics overview`} />
      <div class="page-content fade-in">

        {/* KPI row */}
        <div class="stat-grid">
          <StatCard
            label="Active Voyages"
            value={voyageStats()?.active_voyages ?? '—'}
            sub={`${voyageStats()?.delayed_voyages ?? 0} delayed`}
            accent="var(--status-active)"
          />
          <StatCard
            label="Completed (30d)"
            value={voyageStats()?.completed_last_30d ?? '—'}
            sub={`Avg ${voyageStats()?.avg_distance_nm?.toFixed(0) ?? '—'} nm`}
          />
          <StatCard
            label="Revenue (30d)"
            value={`$${((voyageStats()?.revenue_last_30d ?? 0) / 1000).toFixed(0)}k`}
            sub="from completed voyages"
            accent="var(--gold-600)"
          />
          <StatCard
            label="Cargo Moved"
            value={`${((voyageStats()?.total_cargo_tons ?? 0) / 1000).toFixed(0)}k`}
            sub="tons in transit"
          />
          <StatCard
            label="Vessels Tracked"
            value={vesselStats()?.total_vessels ?? '—'}
            sub={`${vesselStats()?.active_last_hour ?? 0} reported last hour`}
            accent="var(--status-planned)"
          />
          <StatCard
            label="Invoices Pending"
            value={invoiceStats()?.needs_review ?? '—'}
            sub={`Avg confidence ${((invoiceStats()?.avg_confidence_score ?? 0) * 100).toFixed(0)}%`}
            accent={invoiceStats()?.needs_review > 0 ? 'var(--status-delayed)' : undefined}
          />
        </div>

        {/* Charts row */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 220px', gap: '20px', marginBottom: '24px' }}>
          <div class="card">
            <div class="card-header">
              <span style={{ fontFamily: 'var(--font-display)', fontSize: '1rem' }}>Completed Voyages — Last 6 Months</span>
              <svg ref={sparkRef} style={{ width: '120px', height: '40px' }} />
            </div>
            <div style={{ padding: '16px 20px 20px' }}>
              <svg ref={barChartRef!} style={{ width: '100%', height: '200px', display: 'block' }}
                ref={(el) => { barChartRef = el; tryDrawCharts(); }} />
            </div>
          </div>
          <div class="card" style={{ display: 'flex', 'flex-direction': 'column', 'align-items': 'center', padding: '20px' }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '0.95rem', marginBottom: '12px', alignSelf: 'flex-start' }}>By Status</div>
            <svg ref={(el) => { donutRef = el; tryDrawCharts(); }}
              style={{ width: '100%', height: '180px' }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '12px', width: '100%' }}>
              {Object.entries(voyageStats()?.by_status ?? {}).map(([status, count]) => (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem' }}>
                  <span style={{ color: 'var(--text-secondary)', textTransform: 'capitalize' }}>{status}</span>
                  <span class={`badge badge-${status}`}>{String(count)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Bottom row */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
          <div class="card">
            <div class="card-header">
              <span style={{ fontFamily: 'var(--font-display)', fontSize: '1rem' }}>Invoice Validation</span>
            </div>
            <div class="card-body">
              {Object.entries(invoiceStats()?.by_status ?? {}).map(([status, count]) => (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                  <span style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', textTransform: 'capitalize' }}>
                    {status.replace(/_/g, ' ')}
                  </span>
                  <span class={`badge badge-${status}`}>{String(count)}</span>
                </div>
              ))}
              <div style={{ marginTop: '12px', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                Total invoice value: <strong style={{ color: 'var(--text-primary)' }}>
                  ${((invoiceStats()?.total_invoice_value ?? 0) / 1000000).toFixed(2)}M
                </strong>
              </div>
            </div>
          </div>

          <div class="card">
            <div class="card-header">
              <span style={{ fontFamily: 'var(--font-display)', fontSize: '1rem' }}>Cargo Mix</span>
            </div>
            <div class="card-body">
              {Object.entries(voyageStats()?.by_cargo_type ?? {})
                .sort(([, a], [, b]) => (b as number) - (a as number))
                .slice(0, 7)
                .map(([cargo, count]) => {
                  const total = Object.values(voyageStats()?.by_cargo_type ?? {}).reduce((s, v) => s + (v as number), 0);
                  const pct = total ? Math.round((count as number) / total * 100) : 0;
                  return (
                    <div style={{ marginBottom: '10px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.80rem', marginBottom: '3px' }}>
                        <span style={{ color: 'var(--text-secondary)', textTransform: 'capitalize' }}>{cargo}</span>
                        <span style={{ color: 'var(--text-muted)' }}>{pct}%</span>
                      </div>
                      <div style={{ height: '5px', background: 'var(--border)', borderRadius: '3px', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${pct}%`, background: 'var(--accent)', borderRadius: '3px', transition: 'width 0.8s ease' }} />
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

interface StatCardProps {
  label: string;
  value: string | number;
  sub?: string;
  accent?: string;
}

const StatCard: Component<StatCardProps> = (props) => (
  <div class="stat-card" style={props.accent ? { '--accent': props.accent } as Record<string, string> : {}}>
    <div class="stat-label">{props.label}</div>
    <div class="stat-value">{props.value}</div>
    {props.sub && <div class="stat-sub">{props.sub}</div>}
  </div>
);

export default Dashboard;
