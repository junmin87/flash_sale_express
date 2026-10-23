// Scenario B: 1,000 virtual users each buy once with the same userId. Exactly 1
// must succeed and all others must get ALREADY_PURCHASED
// Run by stress/run.sh after the sale is reset with stock 100

import http from 'k6/http';
import { Counter } from 'k6/metrics';

// nginx service on the compose network
const PURCHASE_URL = 'http://nginx/api/purchases';
const USER_ID = 'stress-b-user';
const REQUESTS = 1000;

const created = new Counter('status_201');
const soldOut = new Counter('status_409_sold_out');
const alreadyPurchased = new Counter('status_409_already_purchased');
const forbidden = new Counter('status_403');
const serverError = new Counter('status_5xx');
const other = new Counter('status_other');
const COUNTERS = [
  created,
  soldOut,
  alreadyPurchased,
  forbidden,
  serverError,
  other,
];

export const options = {
  scenarios: {
    // Each of the 1,000 VUs sends exactly one request
    same_user: {
      executor: 'per-vu-iterations',
      vus: REQUESTS,
      iterations: 1,
      maxDuration: '2m',
    },
  },
  thresholds: {
    status_201: ['count==1'],
    status_409_already_purchased: [`count==${REQUESTS - 1}`],
    status_5xx: ['count==0'],
  },
  summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(95)', 'p(99)'],
};

// A counter with no samples is left out of the summary, so every counter
// gets a zero sample before the test starts
export function setup() {
  for (const counter of COUNTERS) counter.add(0);
}

export default function () {
  const res = http.post(PURCHASE_URL, JSON.stringify({ userId: USER_ID }), {
    headers: { 'Content-Type': 'application/json' },
  });
  record(res);
}

// Classify by response status and error code, and add 1 to the matching counter
function record(res) {
  if (res.status === 201) return created.add(1);
  if (res.status === 403) return forbidden.add(1);
  if (res.status >= 500) return serverError.add(1);
  if (res.status === 409) {
    const code = errorCode(res);
    if (code === 'SOLD_OUT') return soldOut.add(1);
    if (code === 'ALREADY_PURCHASED') return alreadyPurchased.add(1);
  }
  other.add(1);
}

function errorCode(res) {
  try {
    return res.json('error.code');
  } catch {
    return undefined;
  }
}

// Print throughput, response times, counts per response code and pass check
// results as a table
export function handleSummary(data) {
  const m = data.metrics;
  const count = (name) => m[name].values.count;
  const ms = (name) => `${m.http_req_duration.values[name].toFixed(2)} ms`;
  const rows = [
    ['Requests', String(count('http_reqs'))],
    ['Throughput', `${m.http_reqs.values.rate.toFixed(1)} req/s`],
    ['Latency avg', ms('avg')],
    ['Latency p95', ms('p(95)')],
    ['Latency p99', ms('p(99)')],
    ['Latency max', ms('max')],
    ['201 Created', String(count('status_201'))],
    ['409 SOLD_OUT', String(count('status_409_sold_out'))],
    ['409 ALREADY_PURCHASED', String(count('status_409_already_purchased'))],
    ['403', String(count('status_403'))],
    ['5xx', String(count('status_5xx'))],
    ['Other', String(count('status_other'))],
  ];
  for (const [name, metric] of Object.entries(m).sort()) {
    for (const [rule, result] of Object.entries(metric.thresholds ?? {})) {
      rows.push([
        `Threshold ${name} ${rule}`,
        result.ok ? 'PASS' : 'FAIL',
      ]);
    }
  }
  const width = Math.max(...rows.map(([label]) => label.length));
  const lines = rows.map(([label, value]) => `  ${label.padEnd(width)}  ${value}`);
  return { stdout: `${lines.join('\n')}\n` };
}
