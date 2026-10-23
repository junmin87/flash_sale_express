-- Decides and records a purchase atomically.
-- KEYS[1] sale start (epoch ms), KEYS[2] sale end (epoch ms), KEYS[3] stock,
-- KEYS[4] buyers set, KEYS[5] order stream
-- ARGV[1] userId, ARGV[2] productId
-- Returns 'OK', 'SALE_NOT_ACTIVE', 'ALREADY_PURCHASED' or 'SOLD_OUT'

-- TIME replies with [seconds, microseconds]
local time = redis.call('TIME')
local now = tonumber(time[1]) * 1000 + math.floor(tonumber(time[2]) / 1000)

-- Active from start (inclusive) until end (exclusive)
local startAt = tonumber(redis.call('GET', KEYS[1]))
local endAt = tonumber(redis.call('GET', KEYS[2]))
if now < startAt or now >= endAt then
  return 'SALE_NOT_ACTIVE'
end

if redis.call('SISMEMBER', KEYS[4], ARGV[1]) == 1 then
  return 'ALREADY_PURCHASED'
end

if tonumber(redis.call('GET', KEYS[3])) <= 0 then
  return 'SOLD_OUT'
end

redis.call('DECR', KEYS[3])
redis.call('SADD', KEYS[4], ARGV[1])
redis.call(
  'XADD', KEYS[5], '*',
  'userId', ARGV[1],
  'productId', ARGV[2],
  'purchasedAt', now
)
return 'OK'
