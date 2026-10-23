// [KO] 시나리오 B: 같은 userId로 가상 사용자 1,000명이 동시에 한 번씩 구매. 성공은 정확히 1, 나머지는 전부 ALREADY_PURCHASED여야 한다
// Run by stress/run.sh after the sale is reset with stock 100

import http from 'k6/http';
import { Counter } from 'k6/metrics';

// nginx service on the compose network
const PURCHASE_URL = 'http://nginx/api/purchases';
const USER_ID = 'stress-b-user';
const REQUESTS = 1000;

// [KO] 응답 코드별 개수
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
    // [KO] VU 1,000명이 각자 정확히 1번씩 요청
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

// [KO] 응답 status와 에러 코드로 분류해 해당 카운터를 1 증가
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

// [KO] 처리량, 응답 시간, 응답 코드별 개수, 통과 조건 결과를 표로 출력
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
