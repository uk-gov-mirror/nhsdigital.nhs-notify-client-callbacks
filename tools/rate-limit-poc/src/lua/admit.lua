-- KEYS[1] = cb:{endpoint}
-- KEYS[2] = rl:{endpoint}
-- ARGV[1] = now_ms
-- ARGV[2] = capacity
-- ARGV[3] = refill_per_sec
-- ARGV[4] = failure_threshold
-- ARGV[5] = cooldown_ms

local cbKey = KEYS[1]
local rlKey = KEYS[2]

local now = tonumber(ARGV[1])
local capacity = tonumber(ARGV[2])
local refillPerSec = tonumber(ARGV[3])
local failureThreshold = tonumber(ARGV[4])
local cooldownMs = tonumber(ARGV[5])

local cb = redis.call("HMGET", cbKey, "state", "failures", "opened_until_ms", "probe_in_flight")
local state = cb[1] or "closed"
local failures = tonumber(cb[2] or "0")
local openedUntil = tonumber(cb[3] or "0")
local probeInFlight = tonumber(cb[4] or "0")

local rl = redis.call("HMGET", rlKey, "tokens", "last_refill_ms")
local tokens = tonumber(rl[1] or capacity)
local lastRefill = tonumber(rl[2] or now)

if state == "open" then
  if now < openedUntil then
    return { 0, "circuit_open", openedUntil - now }
  end
  state = "half_open"
  probeInFlight = 0
end

if state == "half_open" then
  if probeInFlight == 1 then
    return { 0, "circuit_open", cooldownMs }
  end
  probeInFlight = 1
end

local elapsed = now - lastRefill
if elapsed > 0 then
  local refill = math.floor((elapsed * refillPerSec) / 1000)
  if refill > 0 then
    tokens = math.min(capacity, tokens + refill)
    lastRefill = now
  end
end

if tokens < 1 then
  redis.call("HSET", cbKey,
    "state", state,
    "failures", failures,
    "opened_until_ms", openedUntil,
    "probe_in_flight", probeInFlight
  )
  redis.call("HSET", rlKey,
    "tokens", tokens,
    "last_refill_ms", lastRefill
  )
  return { 0, "rate_limited", 1000 }
end

tokens = tokens - 1

redis.call("HSET", cbKey,
  "state", state,
  "failures", failures,
  "opened_until_ms", openedUntil,
  "probe_in_flight", probeInFlight
)
redis.call("HSET", rlKey,
  "tokens", tokens,
  "last_refill_ms", lastRefill
)

redis.call("EXPIRE", cbKey, math.ceil(cooldownMs / 1000) + 60)
redis.call("EXPIRE", rlKey, 120)

return { 1, "allowed", 0 }
