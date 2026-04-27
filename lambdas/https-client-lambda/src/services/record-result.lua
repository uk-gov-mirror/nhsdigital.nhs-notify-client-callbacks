-- record-result.lua — Post-processing: updates sampling and circuit breaker.
--
-- After processing a batch, this script:
--   1. Manages the sliding window (rolling forward as necessary)
--   2. Records new attempts and failures (unless fully open)
--   3. Interpolates attempt/failure rates using the sliding window
--   4. Checks whether to close the circuit (half-open + successes)
--   5. Checks whether to open the circuit (closed + threshold exceeded)
--
-- Returns: { ok (0|1), state }
--   state: "closed" | "opened" | "failed"

-- Return state constants
local OPENED             = "opened"
local CLOSED             = "closed"
local FAILED             = "failed"
local OK                 = "ok"

-- Keys
local epKey              = KEYS[1] -- ep:{targetId}  combined endpoint state hash

-- Arguments
local now                = tonumber(ARGV[1]) or 0
local consumedTokens     = tonumber(ARGV[2]) or 0
local processingFailures = tonumber(ARGV[3]) or 0
local cooldownPeriodMs   = tonumber(ARGV[4]) or 0
local _recoveryPeriodMs  = tonumber(ARGV[5]) or 0 -- luacheck: ignore
local failureThreshold   = tonumber(ARGV[6]) or 0
local minAttempts        = tonumber(ARGV[7]) or 0
local samplePeriodMs     = tonumber(ARGV[8]) or 0

--------------------------------------------------------------------------------
-- LOAD CURRENT STATE
--------------------------------------------------------------------------------

local state              = redis.call("HMGET", epKey,
  "is_open", "switched_at",
  "cur_attempts", "prev_attempts", "cur_failures", "prev_failures",
  "sample_till")
local isOpen             = tonumber(state[1] or "0") == 1
local switchedAt         = tonumber(state[2] or tostring(now))
local curAttempts        = tonumber(state[3] or "0")
local prevAttempts       = tonumber(state[4] or "0")
local curFailures        = tonumber(state[5] or "0")
local prevFailures       = tonumber(state[6] or "0")
local sampleTill         = tonumber(state[7] or "0")

--------------------------------------------------------------------------------
-- 1. DETERMINE CIRCUIT SUB-STATE
--------------------------------------------------------------------------------

local isHalfOpen         = isOpen and now > switchedAt + cooldownPeriodMs
local isFullyOpen        = isOpen and not isHalfOpen

--------------------------------------------------------------------------------
-- 2. MANAGE SLIDING WINDOW
--------------------------------------------------------------------------------

if sampleTill < now then
  if sampleTill + samplePeriodMs < now then
    -- Complete reset — window is too old
    prevAttempts = 0
    prevFailures = 0
    sampleTill   = now + samplePeriodMs
  else
    -- Promote current to previous
    prevAttempts = curAttempts
    prevFailures = curFailures
    sampleTill   = sampleTill + samplePeriodMs
  end
  curAttempts = 0
  curFailures = 0
end

--------------------------------------------------------------------------------
-- 3. RECORD NEW ATTEMPTS/FAILURES (unless fully open)
--------------------------------------------------------------------------------

if not isFullyOpen then
  curAttempts = curAttempts + consumedTokens
  curFailures = curFailures + processingFailures
end

--------------------------------------------------------------------------------
-- 4. INTERPOLATE VALUES
--------------------------------------------------------------------------------

local weight              = (sampleTill - now) / samplePeriodMs
local attempts            = prevAttempts * weight + curAttempts
local failures            = prevFailures * weight + curFailures

--------------------------------------------------------------------------------
-- 5. CIRCUIT BREAKER LOGIC
--------------------------------------------------------------------------------

local processingSuccesses = consumedTokens - processingFailures
local stateChanged        = false

-- Close circuit when half-open and there are successes
if isHalfOpen and processingSuccesses > 0 then
  isOpen       = false
  switchedAt   = now
  stateChanged = true
end

-- Open circuit when closed, enough samples, and threshold exceeded
local hasSampledEnough = attempts >= minAttempts
if not isOpen and hasSampledEnough and (failures / attempts) > failureThreshold then
  isOpen       = true
  switchedAt   = now
  curAttempts  = 0
  curFailures  = 0
  prevAttempts = 0
  prevFailures = 0
  sampleTill   = now + samplePeriodMs
  stateChanged = true
end

--------------------------------------------------------------------------------
-- 6. PERSIST STATE
--------------------------------------------------------------------------------

redis.call("HSET", epKey,
  "cur_attempts", curAttempts,
  "prev_attempts", prevAttempts,
  "cur_failures", curFailures,
  "prev_failures", prevFailures,
  "sample_till", sampleTill
)

if stateChanged then
  redis.call("HSET", epKey,
    "is_open", isOpen and 1 or 0,
    "switched_at", switchedAt
  )
end

if stateChanged and isOpen then
  return { 0, OPENED }
end

if stateChanged and not isOpen then
  return { 1, CLOSED }
end

if isOpen or processingFailures > 0 then
  return { 0, FAILED }
end

return { 1, OK }
