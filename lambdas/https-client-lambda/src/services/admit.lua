-- admit.lua — Decides whether a request to an endpoint is allowed.
--
-- Three sequential checks run atomically:
--   1. Circuit breaker — is the endpoint currently healthy?
--   2. Sliding window  — roll the two-window error-rate accounting state if needed
--   3. Token bucket    — is the endpoint within its rate limit?
--
-- A request is allowed only when all three checks pass.
--
-- While the circuit is open, a timed probe is let through at most once per
-- cbProbeIntervalMs so the caller can test whether the endpoint has recovered.
-- The probe bypasses the rate limit — counting it here would skew a
-- low-volume probe signal against the recovery decision.
--
-- After the circuit closes, the token fill rate ramps up linearly from
-- near-zero to full over decayPeriodMs to avoid a thundering herd on recovery.
--
-- Returns: { allowed (0|1), reason, retryAfterMs, effectiveRate }

-- Keys
local cbKey             = KEYS[1] -- cb:{endpoint}  circuit breaker state hash
local rlKey             = KEYS[2] -- rl:{endpoint}  rate limiter state hash

-- Arguments
local now               = tonumber(ARGV[1]) or 0 -- current wall-clock time (ms)
local capacity          = tonumber(ARGV[2]) or 0 -- token bucket maximum capacity
local refillPerSec      = tonumber(ARGV[3]) or 0 -- full token fill rate (tokens/sec)
local cooldownMs        = tonumber(ARGV[4]) or 0 -- how long the circuit stays open (ms)
local decayPeriodMs     = tonumber(ARGV[5]) or 0 -- ramp-up window after circuit closes (ms)
local cbWindowPeriodMs  = tonumber(ARGV[6]) or 0 -- error-rate sliding window duration (ms)
local cbProbeIntervalMs = tonumber(ARGV[7]) or 0 -- minimum gap between probe requests (ms; 0 = no probes)

-- TTL policy: circuit breaker state must outlive the cooldown window so that
-- the ramp-up period remains visible to subsequent calls after a close.
-- Rate limiter state needs only a short idle window.
local cbTtlSeconds      = math.ceil(cooldownMs / 1000) + 60
local rlTtlSeconds      = 120

--------------------------------------------------------------------------------
-- LOAD STATE
--------------------------------------------------------------------------------

local cb                = redis.call("HMGET", cbKey,
  "opened_until_ms", "cb_window_from", "cb_failures", "cb_attempts", "last_probe_ms",
  "cb_prev_failures", "cb_prev_attempts")
local openedUntil       = tonumber(cb[1] or "0")
local cbWindowFrom      = tonumber(cb[2] or "0")
local cbFailures        = tonumber(cb[3] or "0")
local cbAttempts        = tonumber(cb[4] or "0")
local lastProbeMs       = tonumber(cb[5] or "0")
local cbPrevFailures    = tonumber(cb[6] or "0")
local cbPrevAttempts    = tonumber(cb[7] or "0")

local rl                = redis.call("HMGET", rlKey, "tokens", "last_refill_ms")
local tokens            = tonumber(rl[1] or capacity)
local lastRefill        = tonumber(rl[2] or now)

--------------------------------------------------------------------------------
-- 1. CIRCUIT BREAKER
--
-- The circuit is open when openedUntil is set and has not yet elapsed.
-- All requests are rejected while open to give the endpoint time to recover.
--
-- Timed probes: once per cbProbeIntervalMs a single request is allowed
-- through even while the circuit is open.  The caller must record the
-- outcome via record-result.lua; a successful probe will close the circuit
-- and trigger the ramp-up phase.
--------------------------------------------------------------------------------

if openedUntil > 0 and now < openedUntil then
  -- Allow a probe through if the probe interval has elapsed
  if cbProbeIntervalMs > 0 and (now - lastProbeMs) >= cbProbeIntervalMs then
    lastProbeMs = now
    redis.call("HSET", cbKey,
      "opened_until_ms", openedUntil,
      "cb_window_from", cbWindowFrom,
      "cb_failures", cbFailures,
      "cb_attempts", cbAttempts,
      "last_probe_ms", lastProbeMs,
      "cb_prev_failures", cbPrevFailures,
      "cb_prev_attempts", cbPrevAttempts
    )
    redis.call("EXPIRE", cbKey, cbTtlSeconds)
    return { 1, "probe", 0, 0 }
  end

  -- Circuit is open and no probe slot is available — reject
  return { 0, "circuit_open", openedUntil - now, 0 }
end

--------------------------------------------------------------------------------
-- 2. SLIDING WINDOW
--
-- Two windows (current + previous) together approximate a sliding window over
-- cbWindowPeriodMs.  When the current window expires it is promoted to previous
-- and a fresh current window starts.  record-result.lua blends the two windows
-- using a time-based weight to smooth the error rate across the boundary rather
-- than resetting it to zero at expiry.
--
-- record-result.lua is responsible for incrementing the counters; this script
-- is only responsible for rolling the window boundary forward when it expires.
--------------------------------------------------------------------------------

if cbWindowFrom == 0 then
  -- No window exists yet — start one now
  cbWindowFrom = now
elseif (now - cbWindowFrom) > cbWindowPeriodMs then
  -- Current window has expired — roll it forward
  if (now - cbWindowFrom) > (2 * cbWindowPeriodMs) then
    -- Both current and previous windows are stale: a long quiet period means
    -- old failure counts are no longer relevant to the health of the endpoint.
    cbPrevFailures = 0
    cbPrevAttempts = 0
  else
    -- Promote current → previous so it can be blended with the new current window
    cbPrevFailures = cbFailures
    cbPrevAttempts = cbAttempts
  end
  cbFailures   = 0
  cbAttempts   = 0
  cbWindowFrom = now
end

--------------------------------------------------------------------------------
-- 3. TOKEN BUCKET
--
-- Refills tokens based on elapsed time, then tries to consume one.
-- If no tokens are available the request is rate-limited.
--
-- Ramp-up: after the circuit closes (openedUntil is set but in the past),
-- effectiveRate scales linearly from near-zero to the full refillPerSec over
-- decayPeriodMs.  This deliberately slows recovery traffic so a flapping
-- endpoint is not immediately overwhelmed.
-- Once decayPeriodMs elapses, openedUntil is cleared and the full rate resumes.
--------------------------------------------------------------------------------

local effectiveRate = refillPerSec

if openedUntil > 0 and now > openedUntil and decayPeriodMs > 0 then
  -- Circuit has recently closed — apply linear ramp-up
  local sinceClose = now - openedUntil
  if sinceClose >= decayPeriodMs then
    -- Decay period fully elapsed — restore full rate and clear the CB timestamp
    openedUntil = 0
  else
    -- Still within decay period — scale fill rate proportionally to time elapsed
    local fraction = sinceClose / decayPeriodMs
    effectiveRate  = math.max(1, math.floor(refillPerSec * fraction))
  end
end

-- Refill tokens based on time elapsed since last refill
local elapsed = now - lastRefill
if elapsed > 0 then
  local refill = math.floor((elapsed * effectiveRate) / 1000)
  if refill > 0 then
    tokens     = math.min(capacity, tokens + refill)
    lastRefill = now
  end
end

-- Not enough tokens — rate-limited
-- TTL is intentionally not refreshed here; it was set on the last allowed call.
if tokens < 1 then
  redis.call("HSET", cbKey,
    "opened_until_ms", openedUntil,
    "cb_window_from", cbWindowFrom,
    "cb_failures", cbFailures,
    "cb_attempts", cbAttempts,
    "cb_prev_failures", cbPrevFailures,
    "cb_prev_attempts", cbPrevAttempts
  )
  redis.call("HSET", rlKey,
    "tokens", tokens,
    "last_refill_ms", lastRefill
  )
  return { 0, "rate_limited", 1000, effectiveRate }
end

-- Consume one token
tokens = tokens - 1

--------------------------------------------------------------------------------
-- 4. PERSIST STATE AND ALLOW
--------------------------------------------------------------------------------

redis.call("HSET", cbKey,
  "opened_until_ms", openedUntil,
  "cb_window_from", cbWindowFrom,
  "cb_failures", cbFailures,
  "cb_attempts", cbAttempts,
  "cb_prev_failures", cbPrevFailures,
  "cb_prev_attempts", cbPrevAttempts
)
redis.call("HSET", rlKey,
  "tokens", tokens,
  "last_refill_ms", lastRefill
)

redis.call("EXPIRE", cbKey, cbTtlSeconds)
redis.call("EXPIRE", rlKey, rlTtlSeconds)

return { 1, "allowed", 0, effectiveRate }
