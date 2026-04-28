-- admit.lua — Pre-processing: determines rate limit and consumes tokens.
--
-- Two sequential steps run atomically:
--   1. Circuit breaker — determine effective rate from circuit state
--   2. Token bucket    — consume tokens for the target batch
--
-- The circuit has four states:
--   Open (during cooldown): rate = 0, complete block, bucket untouched
--   Half-open (after cooldown): rate = probeRateLimit
--   Recovering (closed, during recovery period): linear ramp-up
--   Normal (closed): full configured rate
--
-- Returns: { consumedTokens, reason, retryAfterMs, effectiveRate }

-- Keys
local epKey             = KEYS[1] -- ep:{targetId}  combined endpoint state hash

-- Arguments
local now               = tonumber(ARGV[1]) or 0
local capacity          = tonumber(ARGV[2]) or 0
local targetRateLimit   = tonumber(ARGV[3]) or 0
local cooldownMs        = tonumber(ARGV[4]) or 0
local recoveryPeriodMs  = tonumber(ARGV[5]) or 0
local probeRateLimit    = tonumber(ARGV[6]) or 0
local targetBatchSize   = tonumber(ARGV[7]) or 0

--------------------------------------------------------------------------------
-- LOAD STATE
--------------------------------------------------------------------------------

local cbEnabled           = probeRateLimit > 0

local state               = redis.call("HMGET", epKey,
  "is_open", "switched_at", "bucket_tokens", "bucket_refilled_at")
local isOpenRaw           = state[1]
local needInit            = isOpenRaw == false or isOpenRaw == nil
local isOpen              = cbEnabled and (needInit or tonumber(isOpenRaw) == 1)
local switchedAt          = (cbEnabled and needInit) and 0 or tonumber(state[2] or "0")
local bucketTokens        = tonumber(state[3] or "0")
local bucketRefilledAt    = (cbEnabled and needInit) and now or tonumber(state[4] or "0")

--------------------------------------------------------------------------------
-- 1. CIRCUIT BREAKER — determine effective rate
--
-- When probeRateLimit is 0 the circuit breaker is disabled; skip straight to
-- the token bucket at the full configured rate.
--------------------------------------------------------------------------------

local isHalfOpen   = cbEnabled and isOpen and now > switchedAt + cooldownMs
local isRecovering = cbEnabled and (not isOpen) and now < switchedAt + recoveryPeriodMs

local effectiveRate

if not cbEnabled then
  effectiveRate = targetRateLimit
elseif isOpen then
  if isHalfOpen then
    effectiveRate = probeRateLimit
  else
    return { 0, "circuit_open", (switchedAt + cooldownMs) - now, 0 }
  end
else
  if isRecovering then
    local rampRange = math.max(0, targetRateLimit - probeRateLimit)
    local rampProgress = math.max(0, now - switchedAt) / recoveryPeriodMs
    effectiveRate = probeRateLimit + rampProgress * rampRange
  else
    effectiveRate = targetRateLimit
  end
end

--------------------------------------------------------------------------------
-- 2. TOKEN BUCKET — batch consumption
--
-- Generate tokens based on elapsed time, then consume as many as needed for
-- the batch, up to the number available.
--
-- bucketRefilledAt tracks the point in time up to which tokens have been
-- generated. We advance it by exactly the time needed to produce the whole
-- tokens we generated (generationTime), rather than setting it to `now`.
--
-- Why not `now`? Token generation uses floor(), so any sub-token fractional
-- time is truncated. Setting bucketRefilledAt = now would discard that
-- remainder, meaning the next call starts its elapsed-time calculation from
-- a later point than it should. Over many calls this causes token leakage —
-- the bucket refills slower than the configured rate. By advancing only by
-- generationTime, the leftover fractional time carries over to the next call.
--------------------------------------------------------------------------------

if cbEnabled and isOpen then
  bucketTokens = 0
end

local generatedTokens = math.floor((now - bucketRefilledAt) * effectiveRate / 1000)
local availTokens     = math.min(capacity, bucketTokens + generatedTokens)
local consumedTokens  = math.min(targetBatchSize, availTokens)

bucketTokens = availTokens - consumedTokens
if generatedTokens > 0 and effectiveRate > 0 then
  local generationTime = generatedTokens * 1000 / effectiveRate
  bucketRefilledAt     = bucketRefilledAt + generationTime
end

--------------------------------------------------------------------------------
-- 3. PERSIST STATE AND RETURN
--------------------------------------------------------------------------------

redis.call("HSET", epKey,
  "bucket_tokens", bucketTokens,
  "bucket_refilled_at", bucketRefilledAt
)

local reason     = consumedTokens < 1 and "rate_limited" or "allowed"
local retryAfter = consumedTokens < 1 and 1000 or 0
return { consumedTokens, reason, retryAfter, effectiveRate }
