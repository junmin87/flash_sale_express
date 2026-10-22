-- [KO] 구매 판정과 기록을 원자적으로 처리하는 스크립트. 시간·중복·재고 확인 후 재고 차감, 구매자 기록, 주문 Stream 추가까지 한 번에 수행
-- Decides and records a purchase atomically.
-- KEYS[1] sale start (epoch ms), KEYS[2] sale end (epoch ms), KEYS[3] stock,
-- KEYS[4] buyers set, KEYS[5] order stream
-- ARGV[1] userId, ARGV[2] productId
-- Returns 'OK', 'SALE_NOT_ACTIVE', 'ALREADY_PURCHASED' or 'SOLD_OUT'

-- TIME replies with [seconds, microseconds]
local time = redis.call('TIME')
local now = tonumber(time[1]) * 1000 + math.floor(tonumber(time[2]) / 1000)

-- [KO] 시간 확인: 시작 시각 이상, 종료 시각 미만일 때만 판매 중
-- Active from start (inclusive) until end (exclusive)
local startAt = tonumber(redis.call('GET', KEYS[1]))
local endAt = tonumber(redis.call('GET', KEYS[2]))
if now < startAt or now >= endAt then
  return 'SALE_NOT_ACTIVE'
end

-- [KO] 중복 확인: 이미 구매자 명단에 있으면 거절
if redis.call('SISMEMBER', KEYS[4], ARGV[1]) == 1 then
  return 'ALREADY_PURCHASED'
end

-- [KO] 재고 확인: 남은 재고가 없으면 거절
if tonumber(redis.call('GET', KEYS[3])) <= 0 then
  return 'SOLD_OUT'
end

-- [KO] 차감·기록: 재고 차감, 구매자 명단 추가, 주문 Stream에 추가
redis.call('DECR', KEYS[3])
redis.call('SADD', KEYS[4], ARGV[1])
redis.call(
  'XADD', KEYS[5], '*',
  'userId', ARGV[1],
  'productId', ARGV[2],
  'purchasedAt', now
)
return 'OK'
