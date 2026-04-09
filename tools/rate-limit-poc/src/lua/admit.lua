-- admit.lua — Decides whether a request to an endpoint is allowed.
--
-- Two independent checks run atomically:
--   1. Circuit breaker — is the endpoint considered healthy?
--   2. Token bucket    — is the endpoint within its rate limit?
--
-- A request is allowed only if both checks pass.
--
-- Returns: { allowed (0|1), reason, retryAfterMs }

-- Keys
local cbKey         = KEYS[1] -- cb:{endpoint}  — circuit breaker state hash
local rlKey         = KEYS[2] -- rl:{endpoint}  — rate limiter state hash

-- Arguments
local now           = tonumber(ARGV[1]) or 0 -- current time (ms)
local capacity      = tonumber(ARGV[2]) or 0 -- token bucket max capacity
local refillPerSec  = tonumber(ARGV[3]) or 0 -- tokens added per second
local cooldownMs    = tonumber(ARGV[4]) or 0 -- circuit breaker cooldown duration (ms)

--------------------------------------------------------------------------------
-- 1. CIRCUIT BREAKER CHECK
--
-- State machine: closed → open → half_open → closed
--   - closed:    normal operation, all requests pass through
--   - open:      endpoint is unhealthy, reject until cooldown expires
--   - half_open: cooldown expired, allow exactly one probe request through
--------------------------------------------------------------------------------

local cb            = redis.call("HMGET", cbKey,
  "state", "failures", "opened_until_ms", "probe_in_flight")

local state         = cb[1] or "closed"
local failures      = tonumber(cb[2] or "0")
local openedUntil   = tonumber(cb[3] or "0")
local probeInFlight = tonumber(cb[4] or "0")

-- Open → check if cooldown has expired
if state == "open" then
  if now < openedUntil then
    -- Still in cooldown — reject immediately
    return { 0, "circuit_open", openedUntil - now }
  end
  -- Cooldown expired — transition to half_open for a single probe
  state = "half_open"
  probeInFlight = 0
end

-- Half-open → allow exactly one probe request at a time
if state == "half_open" then
  if probeInFlight == 1 then
    -- A probe is already in flight — reject until it completes
    return { 0, "circuit_open", cooldownMs }
  end
  -- Mark that we're sending a probe
  probeInFlight = 1
end

-- Circuit breaker passed (state is "closed" or "half_open" with probe slot)

--------------------------------------------------------------------------------
-- 2. TOKEN BUCKET RATE LIMIT CHECK
--
-- Refills tokens based on elapsed time, then tries to consume one.
-- If no tokens available, the request is rate-limited.
--------------------------------------------------------------------------------

local rl         = redis.call("HMGET", rlKey, "tokens", "last_refill_ms")
local tokens     = tonumber(rl[1] or capacity)
local lastRefill = tonumber(rl[2] or now)

-- Refill tokens based on time elapsed since last refill
local elapsed    = now - lastRefill
if elapsed > 0 then
  local refill = math.floor((elapsed * refillPerSec) / 1000)
  if refill > 0 then
    tokens = math.min(capacity, tokens + refill)
    lastRefill = now
  end
end

-- Not enough tokens — rate-limited
if tokens < 1 then
  redis.call("HSET", cbKey,
    "state", state, "failures", failures,
    "opened_until_ms", openedUntil, "probe_in_flight", probeInFlight)
  redis.call("HSET", rlKey,
    "tokens", tokens, "last_refill_ms", lastRefill)
  return { 0, "rate_limited", 1000 }
end

-- Consume one token
tokens = tokens - 1

--------------------------------------------------------------------------------
-- 3. PERSIST STATE AND ALLOW
--------------------------------------------------------------------------------

redis.call("HSET", cbKey,
  "state", state, "failures", failures,
  "opened_until_ms", openedUntil, "probe_in_flight", probeInFlight)
redis.call("HSET", rlKey,
  "tokens", tokens, "last_refill_ms", lastRefill)

-- TTL / expiry policy:
-- - Keep circuit breaker state for at least cooldown duration plus a small buffer.
-- - Keep rate limiter state for a short idle window.
local cooldownSeconds    = math.ceil(cooldownMs / 1000)
local cbTtlBufferSeconds = 60
local cbTtlSeconds       = cooldownSeconds + cbTtlBufferSeconds
local rlTtlSeconds       = 120
redis.call("EXPIRE", cbKey, cbTtlSeconds)
redis.call("EXPIRE", rlKey, rlTtlSeconds)

return { 1, "allowed", 0 }
