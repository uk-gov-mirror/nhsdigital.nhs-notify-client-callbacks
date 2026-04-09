-- KEYS[1] = cb:{endpoint}
-- KEYS[2] = rl:{endpoint}
-- ARGV[1] = now_ms
-- ARGV[2] = capacity
-- ARGV[3] = refill_per_sec
-- ARGV[4] = cooldown_ms
-- ARGV[5] = decay_period_ms
-- ARGV[6] = cb_window_period_ms
-- ARGV[7] = cb_probe_interval_ms

local cbKey = KEYS[1]
local rlKey = KEYS[2]

local now = tonumber(ARGV[1])
local capacity = tonumber(ARGV[2])
local refillPerSec = tonumber(ARGV[3])
local cooldownMs = tonumber(ARGV[4])
local decayPeriodMs = tonumber(ARGV[5])
local cbWindowPeriodMs = tonumber(ARGV[6])
local cbProbeIntervalMs = tonumber(ARGV[7])

local cb = redis.call("HMGET", cbKey,
  "opened_until_ms", "cb_window_from", "cb_failures", "cb_attempts", "last_probe_ms")
local openedUntil = tonumber(cb[1] or "0")
local cbWindowFrom = tonumber(cb[2] or "0")
local cbFailures = tonumber(cb[3] or "0")
local cbAttempts = tonumber(cb[4] or "0")
local lastProbeMs = tonumber(cb[5] or "0")

local rl = redis.call("HMGET", rlKey, "tokens", "last_refill_ms")
local tokens = tonumber(rl[1] or capacity)
local lastRefill = tonumber(rl[2] or now)

if openedUntil > 0 and now < openedUntil then
  if cbProbeIntervalMs > 0 and (now - lastProbeMs) >= cbProbeIntervalMs then
    lastProbeMs = now
    redis.call("HSET", cbKey,
      "opened_until_ms", openedUntil,
      "cb_window_from", cbWindowFrom,
      "cb_failures", cbFailures,
      "cb_attempts", cbAttempts,
      "last_probe_ms", lastProbeMs
    )
    redis.call("EXPIRE", cbKey, math.ceil(cooldownMs / 1000) + 60)
    return { 1, "probe", 0, 0 }
  end
  return { 0, "circuit_open", openedUntil - now, 0 }
end

if cbWindowFrom > 0 and (now - cbWindowFrom) > cbWindowPeriodMs then
  cbFailures = 0
  cbAttempts = 0
  cbWindowFrom = now
end

if cbWindowFrom == 0 then
  cbWindowFrom = now
end

local effectiveRate = refillPerSec

if openedUntil > 0 and now > openedUntil and decayPeriodMs > 0 then
  local sinceClose = now - openedUntil
  if sinceClose >= decayPeriodMs then
    openedUntil = 0
  else
    local fraction = sinceClose / decayPeriodMs
    effectiveRate = math.max(1, math.floor(refillPerSec * fraction))
  end
end

local elapsed = now - lastRefill
if elapsed > 0 then
  local refill = math.floor((elapsed * effectiveRate) / 1000)
  if refill > 0 then
    tokens = math.min(capacity, tokens + refill)
    lastRefill = now
  end
end

if tokens < 1 then
  redis.call("HSET", cbKey,
    "opened_until_ms", openedUntil,
    "cb_window_from", cbWindowFrom,
    "cb_failures", cbFailures,
    "cb_attempts", cbAttempts
  )
  redis.call("HSET", rlKey,
    "tokens", tokens,
    "last_refill_ms", lastRefill
  )
  return { 0, "rate_limited", 1000, effectiveRate }
end

tokens = tokens - 1

redis.call("HSET", cbKey,
  "opened_until_ms", openedUntil,
  "cb_window_from", cbWindowFrom,
  "cb_failures", cbFailures,
  "cb_attempts", cbAttempts
)
redis.call("HSET", rlKey,
  "tokens", tokens,
  "last_refill_ms", lastRefill
)

redis.call("EXPIRE", cbKey, math.ceil(cooldownMs / 1000) + 60)
redis.call("EXPIRE", rlKey, 120)

return { 1, "allowed", 0, effectiveRate }
