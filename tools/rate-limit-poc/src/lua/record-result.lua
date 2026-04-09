-- record-result.lua — Records the outcome of a delivery attempt.
--
-- Updates the circuit breaker state based on whether the call succeeded.
--
-- Returns: { ok (0|1), state }

-- Keys
local cbKey              = KEYS[1] -- cb:{endpoint}  — circuit breaker state hash

-- Arguments
local now                = tonumber(ARGV[1]) or 0 -- current time (ms)
local success            = tonumber(ARGV[2]) or 0 -- 1 = success, 0 = failure
local failureThreshold   = tonumber(ARGV[3]) or 0 -- consecutive failures to trip circuit
local cooldownMs         = tonumber(ARGV[4]) or 0 -- how long circuit stays open (ms)

-- TTL / expiry policy:
-- - Keep circuit breaker state for at least cooldown duration plus a small buffer.
local cooldownSeconds    = math.ceil(cooldownMs / 1000)
local cbTtlBufferSeconds = 60
local cbTtlSeconds       = cooldownSeconds + cbTtlBufferSeconds

local function refreshCbExpiry()
  redis.call("EXPIRE", cbKey, cbTtlSeconds)
end

--------------------------------------------------------------------------------
-- LOAD CURRENT STATE
--------------------------------------------------------------------------------

local cb          = redis.call("HMGET", cbKey,
  "state", "failures", "opened_until_ms", "probe_in_flight")

local state       = cb[1] or "closed"
local failures    = tonumber(cb[2] or "0")
local openedUntil = tonumber(cb[3] or "0")

--------------------------------------------------------------------------------
-- SUCCESS — reset circuit breaker to healthy
--------------------------------------------------------------------------------

if success == 1 then
  redis.call("HSET", cbKey,
    "state", "closed", "failures", 0,
    "opened_until_ms", 0, "probe_in_flight", 0)
  refreshCbExpiry()
  return { 1, "closed" }
end

--------------------------------------------------------------------------------
-- FAILURE — increment counter and evaluate whether to open the circuit
--
-- Circuit opens when:
--   a) we're in half_open (the single probe failed), OR
--   b) consecutive failures reach the threshold
--------------------------------------------------------------------------------

failures = failures + 1

if state == "half_open" or failures >= failureThreshold then
  redis.call("HSET", cbKey,
    "state", "open", "failures", failures,
    "opened_until_ms", now + cooldownMs, "probe_in_flight", 0)
  refreshCbExpiry()
  return { 0, "opened" }
end

-- Below threshold — record the failure but keep circuit closed
redis.call("HSET", cbKey,
  "state", state, "failures", failures,
  "opened_until_ms", openedUntil, "probe_in_flight", 0)
refreshCbExpiry()
return { 0, "failed" }
