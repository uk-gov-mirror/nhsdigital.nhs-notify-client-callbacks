-- record-result.lua
-- Atomic two-window sliding circuit-breaker state update.
-- KEYS[1] = cb:{targetId}   (circuit breaker hash)
-- ARGV[1] = now (epoch ms)
-- ARGV[2] = success ("1" or "0")
-- ARGV[3] = cbWindowPeriodMs
-- ARGV[4] = cbErrorThreshold (float, e.g. "0.5")
-- ARGV[5] = cbMinAttempts (integer)
-- ARGV[6] = cbCooldownMs
-- ARGV[7] = decayPeriodMs

local cb_key = KEYS[1]
local now = tonumber(ARGV[1])
local success = ARGV[2] == "1"
local windowPeriodMs = tonumber(ARGV[3])
local errorThreshold = tonumber(ARGV[4])
local minAttempts = tonumber(ARGV[5])
local cooldownMs = tonumber(ARGV[6])
local decayPeriodMs = tonumber(ARGV[7])

-- Load current state
local opened_until_ms = tonumber(redis.call("HGET", cb_key, "opened_until_ms") or "0") or 0
local cb_window_from = tonumber(redis.call("HGET", cb_key, "cb_window_from") or "0") or 0
local cb_failures = tonumber(redis.call("HGET", cb_key, "cb_failures") or "0") or 0
local cb_attempts = tonumber(redis.call("HGET", cb_key, "cb_attempts") or "0") or 0
local cb_prev_failures = tonumber(redis.call("HGET", cb_key, "cb_prev_failures") or "0") or 0
local cb_prev_attempts = tonumber(redis.call("HGET", cb_key, "cb_prev_attempts") or "0") or 0

-- Initialise window if not set
if cb_window_from == 0 then
  cb_window_from = now
end

-- Check for window expiry and roll
if (now - cb_window_from) >= windowPeriodMs then
  cb_prev_failures = cb_failures
  cb_prev_attempts = cb_attempts
  cb_failures = 0
  cb_attempts = 0
  cb_window_from = now
end

-- Increment counters
cb_attempts = cb_attempts + 1
if not success then
  cb_failures = cb_failures + 1
end

-- Compute two-window blended error rate
local elapsed_in_window = now - cb_window_from
local prev_weight = 0
if windowPeriodMs > 0 and elapsed_in_window < windowPeriodMs then
  prev_weight = 1 - (elapsed_in_window / windowPeriodMs)
end

local blended_failures = cb_prev_failures * prev_weight + cb_failures
local blended_attempts = cb_prev_attempts * prev_weight + cb_attempts

local state = "closed"

-- Check if we should open the circuit
if blended_attempts >= minAttempts and blended_attempts > 0 then
  local error_rate = blended_failures / blended_attempts
  if error_rate >= errorThreshold then
    opened_until_ms = now + cooldownMs
    state = "opened"
  end
end

-- During active decay, preserve opened_until_ms as decay start marker
if opened_until_ms > 0 and now >= opened_until_ms then
  local elapsed_since_close = now - opened_until_ms
  if elapsed_since_close >= decayPeriodMs then
    opened_until_ms = 0
  end
end

-- Write updated state
redis.call("HSET", cb_key,
  "opened_until_ms", tostring(opened_until_ms),
  "cb_window_from", tostring(cb_window_from),
  "cb_failures", tostring(cb_failures),
  "cb_attempts", tostring(cb_attempts),
  "cb_prev_failures", tostring(cb_prev_failures),
  "cb_prev_attempts", tostring(cb_prev_attempts)
)

if state == "opened" then
  return cjson.encode({ ok = false, state = "opened" })
end

return cjson.encode({ ok = true, state = "closed" })
