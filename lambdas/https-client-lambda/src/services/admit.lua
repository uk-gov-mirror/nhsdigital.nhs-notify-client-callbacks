-- admit.lua
-- Atomic token-bucket rate limiter + circuit-breaker admission check.
-- KEYS[1] = rl:{targetId}   (rate limiter hash)
-- KEYS[2] = cb:{targetId}   (circuit breaker hash)
-- ARGV[1] = now (epoch ms)
-- ARGV[2] = refillPerSec (tokens/sec from target config)
-- ARGV[3] = capacity (burst capacity)
-- ARGV[4] = cbProbeIntervalMs
-- ARGV[5] = cbEnabled ("1" or "0")
-- ARGV[6] = decayPeriodMs

local rl_key = KEYS[1]
local cb_key = KEYS[2]
local now = tonumber(ARGV[1])
local refillPerSec = tonumber(ARGV[2])
local capacity = tonumber(ARGV[3])
local cbProbeIntervalMs = tonumber(ARGV[4])
local cbEnabled = ARGV[5] == "1"
local decayPeriodMs = tonumber(ARGV[6])

-- Load circuit breaker state
local opened_until_ms = tonumber(redis.call("HGET", cb_key, "opened_until_ms") or "0") or 0
local last_probe_ms = tonumber(redis.call("HGET", cb_key, "last_probe_ms") or "0") or 0

-- Circuit breaker evaluation (only when enabled)
if cbEnabled and opened_until_ms > 0 and now < opened_until_ms then
  -- Circuit is open — check for probe slot
  if cbProbeIntervalMs > 0 and (now - last_probe_ms) >= cbProbeIntervalMs then
    redis.call("HSET", cb_key, "last_probe_ms", tostring(now))
    return cjson.encode({
      allowed = true,
      probe = true,
      effectiveRate = 0,
    })
  end
  -- No probe slot available
  local retryAfterMs = opened_until_ms - now
  return cjson.encode({
    allowed = false,
    reason = "circuit_open",
    retryAfterMs = retryAfterMs,
    effectiveRate = 0,
  })
end

-- Compute effective rate (with decay scaling if applicable)
local effectiveRate = refillPerSec

if cbEnabled and opened_until_ms > 0 and now >= opened_until_ms and decayPeriodMs > 0 then
  local elapsed_since_close = now - opened_until_ms
  if elapsed_since_close < decayPeriodMs then
    effectiveRate = refillPerSec * (elapsed_since_close / decayPeriodMs)
    if effectiveRate < 0.001 then
      effectiveRate = 0.001
    end
  end
end

-- Load rate limiter state
local tokens = tonumber(redis.call("HGET", rl_key, "tokens") or "") or capacity
local last_refill_ms = tonumber(redis.call("HGET", rl_key, "last_refill_ms") or "") or now

-- Refill tokens
local elapsed_ms = now - last_refill_ms
if elapsed_ms > 0 then
  tokens = math.min(capacity, tokens + elapsed_ms * effectiveRate / 1000)
end

-- Check rate limit
if tokens < 1 then
  -- Compute retry-after based on effective rate
  local retryAfterMs = 0
  if effectiveRate > 0 then
    retryAfterMs = math.ceil((1 - tokens) / effectiveRate * 1000)
  else
    retryAfterMs = 1000
  end
  return cjson.encode({
    allowed = false,
    reason = "rate_limited",
    retryAfterMs = retryAfterMs,
    effectiveRate = effectiveRate,
  })
end

-- Deduct token and update state
tokens = tokens - 1
redis.call("HSET", rl_key, "tokens", tostring(tokens))
redis.call("HSET", rl_key, "last_refill_ms", tostring(now))

return cjson.encode({
  allowed = true,
  probe = false,
  effectiveRate = effectiveRate,
})
