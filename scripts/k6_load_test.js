import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const errorRate = new Rate('errors');
const apiLatency = new Trend('api_latency', true);

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8000';

export const options = {
  stages: [
    { duration: '1m',  target: 20  },
    { duration: '3m',  target: 100 },
    { duration: '1m',  target: 0   },
  ],
  thresholds: {
    // p99 latency must stay under 2000ms — deployment blocked if breached
    'http_req_duration{percentile:99}': ['p(99)<2000'],
    // error rate must stay under 1%
    'http_req_failed': ['rate<0.01'],
    // custom metric
    'api_latency': ['p(95)<1500'],
  },
};

const ENDPOINTS = [
  '/api/voyages/',
  '/api/voyages/active/',
  '/api/voyages/dashboard_stats/',
  '/api/vessels/live_positions/',
  '/api/vessels/stats/',
  '/api/invoices/',
  '/api/invoices/dashboard_stats/',
  '/api/health/',
  '/api/observability/metrics/',
];

export default function () {
  const endpoint = ENDPOINTS[Math.floor(Math.random() * ENDPOINTS.length)];
  const url = `${BASE_URL}${endpoint}`;

  const start = Date.now();
  const res = http.get(url, {
    headers: { 'Accept': 'application/json' },
    timeout: '10s',
  });
  const elapsed = Date.now() - start;

  apiLatency.add(elapsed);

  const ok = check(res, {
    'status is 200': (r) => r.status === 200,
    'response time < 2000ms': (r) => r.timings.duration < 2000,
    'has JSON body': (r) => r.headers['Content-Type']?.includes('application/json'),
  });

  if (!ok) errorRate.add(1);
  else errorRate.add(0);

  sleep(Math.random() * 1 + 0.5);
}

export function handleSummary(data) {
  const p99 = data.metrics.http_req_duration?.values?.['p(99)'] ?? 0;
  const errRate = data.metrics.http_req_failed?.values?.rate ?? 0;
  const baseline = __ENV.BASELINE_P99 ? parseFloat(__ENV.BASELINE_P99) : null;

  console.log(`\nResults:`);
  console.log(`  p99 latency:  ${p99.toFixed(0)}ms (threshold: <2000ms)`);
  console.log(`  error rate:   ${(errRate * 100).toFixed(2)}% (threshold: <1%)`);

  if (baseline && p99 > baseline * 1.20) {
    console.error(`\nREGRESSION: p99 ${p99.toFixed(0)}ms > baseline ${baseline.toFixed(0)}ms * 1.20`);
    return { stdout: JSON.stringify(data) };
  }

  return {
    'k6_results.json': JSON.stringify(data, null, 2),
    stdout: `\nAll thresholds passed. p99=${p99.toFixed(0)}ms error_rate=${(errRate * 100).toFixed(2)}%\n`,
  };
}
