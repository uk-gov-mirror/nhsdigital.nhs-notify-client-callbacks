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

local state               = redis.call("HMGET", epKey,
  "is_open", "switched_at", "bucket_tokens", "bucket_refilled_at")
local isOpen              = tonumber(state[1] or "0") == 1
local switchedAtRaw       = state[2]
local switchedAt          = tonumber(switchedAtRaw or tostring(now))
local bucketTokens        = tonumber(state[3] or "0")
local bucketRefilledAt    = tonumber(state[4] or "0")
local needInitSwitchedAt  = switchedAtRaw == false or switchedAtRaw == nil

--------------------------------------------------------------------------------
-- 1. CIRCUIT BREAKER — determine effective rate
--------------------------------------------------------------------------------

local isHalfOpen   = isOpen and now > switchedAt + cooldownMs
local isRecovering = (not isOpen) and now < switchedAt + recoveryPeriodMs

local effectiveRate

if isOpen then
  if isHalfOpen then
    effectiveRate = probeRateLimit
  else
    return { 0, "circuit_open", (switchedAt + cooldownMs) - now, 0 }
  end
else
  if isRecovering then
    effectiveRate = targetRateLimit * (now - switchedAt) / recoveryPeriodMs
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
-- Refill precision: bucketRefilledAt advances by exactly the time required to
-- generate the whole tokens (not set to `now`), preserving fractional time.
--------------------------------------------------------------------------------

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

if needInitSwitchedAt then
  redis.call("HSET", epKey, "switched_at", switchedAt)
end

local reason     = consumedTokens < 1 and "rate_limited" or "allowed"
local retryAfter = consumedTokens < 1 and 1000 or 0
return { consumedTokens, reason, retryAfter, effectiveRate }
