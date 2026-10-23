#!/usr/bin/env bash
# [KO] 스트레스 테스트 실행기: 시나리오마다 세일 리셋 → k6 실행 → 워커 저장 대기 → Redis·Postgres 정합성 검증 후 PASS/FAIL 출력
# Runs both stress scenarios against the running compose stack (nginx -> api1/api2
# -> Redis Lua -> worker -> Postgres). Exits 1 if any check fails.
# Requires: docker compose up -d --build
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# nginx is published on port 80 of the host (docker-compose.yml)
BASE_URL="http://localhost/api"
SALE_STOCK=100
WORKER_TIMEOUT_SECONDS=60
RESULTS_DIR="$ROOT/stress/results"

# Must match api/src/infra/redis-keys.ts
KEY_STOCK="sale:stock"
KEY_TOTAL_STOCK="sale:total_stock"
KEY_BUYERS="sale:buyers"

failed=0

redis_cmd() {
  docker compose exec -T redis redis-cli "$@"
}

# The query is passed as $0 so the container's own POSTGRES_USER/POSTGRES_DB are used
psql_query() {
  docker compose exec -T postgres \
    sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 -tAc "$0"' "$1"
}

# [KO] epoch 초를 ISO 8601(UTC)로 변환. GNU date(-d)와 BSD/macOS date(-r) 모두 지원
iso_time() {
  date -u -d "@$1" +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -r "$1" +%Y-%m-%dT%H:%M:%SZ
}

# [KO] 기대값과 실제값이 같으면 PASS, 다르면 FAIL 출력 후 실패 표시
check() {
  local label="$1" expected="$2" actual="$3"
  if [ "$actual" = "$expected" ]; then
    printf '  PASS  %s (%s)\n' "$label" "$actual"
  else
    printf '  FAIL  %s (expected %s, got %s)\n' "$label" "$expected" "$actual"
    failed=1
  fi
}

# [KO] 1. 전체 스택 확인: /api/health가 응답하고 Redis·Postgres 모두 ok인지
check_stack() {
  local health
  if ! health="$(curl -sf --max-time 5 "$BASE_URL/health")" ||
    [[ "$health" != *'"redis":{"ok":true'* ]] ||
    [[ "$health" != *'"postgres":{"ok":true'* ]]; then
    echo "The stack is not running or not healthy (GET $BASE_URL/health)."
    echo "Run 'docker compose up -d --build' first."
    exit 1
  fi
}

# [KO] 2. 세일 리셋: 1분 전 시작, 1시간 뒤 종료, 재고 100. 관리자 API가 꺼져 있으면(404) 안내 후 종료
reset_sale() {
  local now body response status
  now="$(date +%s)"
  body="{\"startAt\":\"$(iso_time $((now - 60)))\",\"endAt\":\"$(iso_time $((now + 3600)))\",\"stock\":$SALE_STOCK}"
  response="$(curl -s --max-time 10 -w '\n%{http_code}' -X POST \
    -H 'Content-Type: application/json' -d "$body" "$BASE_URL/admin/sale")"
  status="${response##*$'\n'}"
  if [ "$status" = "404" ]; then
    echo "POST /api/admin/sale returned 404. The admin API is disabled (ADMIN_ENABLED=false)."
    echo "Set ADMIN_ENABLED=true (or leave it empty) and run 'docker compose up -d' again."
    exit 1
  fi
  if [ "$status" != "201" ]; then
    echo "Failed to reset the sale (HTTP $status): ${response%$'\n'*}"
    exit 1
  fi
  echo "Sale reset: stock $SALE_STOCK, started 1 minute ago, ends in 1 hour"
}

# [KO] 4. 워커 저장 대기: Postgres 주문 수가 Redis 구매자 수와 같아질 때까지 최대 60초
wait_for_worker() {
  local buyers orders
  for ((i = 0; i < WORKER_TIMEOUT_SECONDS; i++)); do
    buyers="$(redis_cmd SCARD "$KEY_BUYERS")"
    orders="$(psql_query 'SELECT count(*) FROM orders')"
    if [ "$buyers" = "$orders" ]; then
      break
    fi
    sleep 1
  done
  check "Worker persisted all orders within ${WORKER_TIMEOUT_SECONDS}s" "$buyers" "$orders"
}

# [KO] 5. 정합성 검증: 총 재고 = 남은 재고 + 구매자 수, 구매자 수 = 주문 수, 중복 0, 성공 수
verify() {
  local expected_success="$1" total remaining buyers orders duplicates
  total="$(redis_cmd GET "$KEY_TOTAL_STOCK")"
  remaining="$(redis_cmd GET "$KEY_STOCK")"
  buyers="$(redis_cmd SCARD "$KEY_BUYERS")"
  orders="$(psql_query 'SELECT count(*) FROM orders')"
  duplicates="$(psql_query 'SELECT count(*) FROM (SELECT user_id FROM orders GROUP BY user_id HAVING count(*) > 1) d')"

  echo "  Redis: total stock $total, remaining $remaining, buyers $buyers / Postgres: orders $orders"
  check "Total stock = remaining stock + Redis buyers" "$total" "$((remaining + buyers))"
  check "Redis buyers = Postgres orders" "$buyers" "$orders"
  check "Duplicate user_id in Postgres" "0" "$duplicates"
  check "Successful purchases (Redis buyers)" "$expected_success" "$buyers"
  check "Successful purchases (Postgres orders)" "$expected_success" "$orders"
}

# [KO] 시나리오 하나 실행: 리셋 → k6 → 워커 대기 → 검증. k6 출력은 stress/results/에 저장
run_scenario() {
  local title="$1" script="$2" expected_success="$3" result_file
  result_file="$RESULTS_DIR/$(date +%Y%m%d-%H%M%S)-${script%.js}.txt"

  echo
  echo "=== $title ==="
  reset_sale

  echo "Running k6 ($script)..."
  if docker compose --profile stress run --rm -T k6 run -q "/scripts/$script" |
    tee "$result_file"; then
    check "k6 thresholds" "passed" "passed"
  else
    check "k6 thresholds" "passed" "failed"
  fi
  echo "  k6 summary saved to ${result_file#"$ROOT/"}"

  wait_for_worker
  verify "$expected_success"
}

check_stack
mkdir -p "$RESULTS_DIR"

run_scenario "Scenario A: 10,000 distinct users, 1,000 VUs, stock $SALE_STOCK" \
  purchase-distinct.js "$SALE_STOCK"
run_scenario "Scenario B: same user, 1,000 concurrent requests, stock $SALE_STOCK" \
  purchase-same-user.js 1

echo
if [ "$failed" -eq 0 ]; then
  echo "RESULT: PASS"
else
  echo "RESULT: FAIL"
fi
echo "Sale data has been reset by this test. Use 'Start now' in Demo controls on the web page to reinitialize it."
exit "$failed"
