-- record-result.lua — Records the outcome of a delivery attempt.
--
-- Updates the circuit breaker's error-rate window counters and opens the
-- circuit if the failure rate exceeds the configured threshold.
--
-- On success:
--   Window counters are left intact.  The openedUntil timestamp is preserved
--   while the decay period is still active so that admit.lua can continue
--   computing the linear ramp-up rate.  Once the decay period elapses it
--   is zeroed, returning the circuit to a fully clean closed state.
--
-- On failure:
--   The failure and attempt counters are incremented.  A two-window sliding
--   blend is computed before evaluating the trip condition:
--     slidingAttempts = cbAttempts + cbPrevAttempts * prevWeight
--     slidingFailures = cbFailures + cbPrevFailures * prevWeight
--   where prevWeight decays linearly from 1.0 → 0.0 as the current window ages,
--   so previous-window failures fade out gradually rather than dropping off a cliff.
--   The circuit opens when:
--     • the endpoint is not already open (prevents double-tripping and
--       resetting the cooldown timer prematurely), AND
--     • slidingAttempts >= cbMinAttempts (avoids tripping on statistically
--       insignificant data at cold start or just after a window roll), AND
--     • slidingFailures / slidingAttempts exceeds cbErrorThreshold.
--   On open, all counters (current and previous) are reset to zero so the
--   fresh cooldown window begins with a clean slate ready for recovery.
--
-- Returns: { ok (0|1), state }
--   state: "closed" | "opened" | "failed"

-- Keys
local cbKey            = KEYS[1] -- cb:{endpoint}  circuit breaker state hash

-- Arguments
local now              = tonumber(ARGV[1]) or 0 -- current wall-clock time (ms)
local success          = tonumber(ARGV[2]) or 0 -- 1 = success, 0 = failure
local cooldownMs       = tonumber(ARGV[3]) or 0 -- how long the circuit stays open (ms)
local decayPeriodMs    = tonumber(ARGV[4]) or 0 -- ramp-up window after circuit closes (ms)
local cbErrorThreshold = tonumber(ARGV[5]) or 0 -- error-rate fraction that trips the circuit (e.g. 0.5)
local cbMinAttempts    = tonumber(ARGV[6]) or 0 -- minimum samples before the circuit can trip
local cbWindowPeriodMs = tonumber(ARGV[7]) or 0 -- error-rate sliding window duration (ms)

-- TTL policy: keep circuit breaker state alive for at least the cooldown
-- duration plus a buffer so the decay period remains visible after a close.
local cbTtlSeconds     = math.ceil(cooldownMs / 1000) + 60

local function refreshCbExpiry()
  redis.call("EXPIRE", cbKey, cbTtlSeconds)
end

--------------------------------------------------------------------------------
-- LOAD CURRENT STATE
--------------------------------------------------------------------------------

local cb             = redis.call("HMGET", cbKey,
  "opened_until_ms", "cb_window_from", "cb_failures", "cb_attempts",
  "cb_prev_failures", "cb_prev_attempts")
local openedUntil    = tonumber(cb[1] or "0")
local cbWindowFrom   = tonumber(cb[2] or "0")
local cbFailures     = tonumber(cb[3] or "0")
local cbAttempts     = tonumber(cb[4] or "0")
local cbPrevFailures = tonumber(cb[5] or "0")
local cbPrevAttempts = tonumber(cb[6] or "0")

-- Every outcome (success or failure) contributes to the error-rate window
cbAttempts           = cbAttempts + 1

--------------------------------------------------------------------------------
-- SUCCESS — preserve openedUntil during decay, then zero it
--
-- admit.lua uses openedUntil to calculate the linear ramp-up rate while the
-- decay period is active.  That timestamp must survive in Redis until the
-- decay period ends.  Clearing it prematurely would snap the fill rate back
-- to full immediately rather than ramping gradually.
--------------------------------------------------------------------------------

if success == 1 then
  -- Keep openedUntil only if we are still within the decay window
  local inDecayWindow        = openedUntil > 0 and now > openedUntil and (now - openedUntil) < decayPeriodMs
  local preservedOpenedUntil = inDecayWindow and openedUntil or 0

  redis.call("HSET", cbKey,
    "opened_until_ms", preservedOpenedUntil,
    "cb_window_from", cbWindowFrom,
    "cb_failures", cbFailures,
    "cb_attempts", cbAttempts,
    "cb_prev_failures", cbPrevFailures,
    "cb_prev_attempts", cbPrevAttempts
  )
  refreshCbExpiry()
  return { 1, "closed" }
end

--------------------------------------------------------------------------------
-- FAILURE — increment counter and evaluate whether to open the circuit
--
-- The trip condition is evaluated against a sliding blend of current and
-- previous window counts, not the raw current-window counts alone.  This
-- prevents a burst of failures from escaping detection simply because it
-- straddles a window boundary and gets partially discarded by a reset.
--------------------------------------------------------------------------------

cbFailures               = cbFailures + 1

-- The circuit is already open when openedUntil is set and has not yet elapsed.
-- Guard against double-tripping, which would reset the cooldown timer early.
local circuitAlreadyOpen = openedUntil > 0 and now < openedUntil

-- Blend current and previous window counts.
-- prevWeight decays linearly from 1.0 → 0.0 as the current window ages,
-- so previous-window failures fade out gradually rather than dropping off a cliff.
local windowElapsed      = cbWindowFrom > 0 and (now - cbWindowFrom) or 0
local hasWindow          = cbWindowPeriodMs > 0
local prevWeight         = hasWindow and math.max(0, (cbWindowPeriodMs - windowElapsed) / cbWindowPeriodMs) or 0
local slidingFailures    = cbFailures + cbPrevFailures * prevWeight
local slidingAttempts    = cbAttempts + cbPrevAttempts * prevWeight

if not circuitAlreadyOpen
    and slidingAttempts >= cbMinAttempts -- enough data to be statistically meaningful
    and (slidingFailures / slidingAttempts) > cbErrorThreshold then
  -- Trip the circuit — reset all counters so recovery starts from a clean slate
  redis.call("HSET", cbKey,
    "opened_until_ms", now + cooldownMs,
    "cb_window_from", 0,
    "cb_failures", 0,
    "cb_attempts", 0,
    "cb_prev_failures", 0,
    "cb_prev_attempts", 0
  )
  refreshCbExpiry()
  return { 0, "opened" }
end

-- Below the threshold — record the failure but keep the circuit closed
redis.call("HSET", cbKey,
  "opened_until_ms", openedUntil,
  "cb_window_from", cbWindowFrom,
  "cb_failures", cbFailures,
  "cb_attempts", cbAttempts,
  "cb_prev_failures", cbPrevFailures,
  "cb_prev_attempts", cbPrevAttempts
)
refreshCbExpiry()
return { 0, "failed" }
