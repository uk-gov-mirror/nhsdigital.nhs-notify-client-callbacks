-- KEYS[1] = cb:{endpoint}
-- ARGV[1] = now_ms
-- ARGV[2] = success (1 or 0)
-- ARGV[3] = cooldown_ms
-- ARGV[4] = decay_period_ms
-- ARGV[5] = cb_error_threshold (float, e.g. 0.5)
-- ARGV[6] = cb_min_attempts

local cbKey = KEYS[1]
local now = tonumber(ARGV[1])
local success = tonumber(ARGV[2])
local cooldownMs = tonumber(ARGV[3])
local decayPeriodMs = tonumber(ARGV[4])
local cbErrorThreshold = tonumber(ARGV[5])
local cbMinAttempts = tonumber(ARGV[6])

local cb = redis.call("HMGET", cbKey,
  "opened_until_ms", "cb_window_from", "cb_failures", "cb_attempts")
local openedUntil = tonumber(cb[1] or "0")
local cbWindowFrom = tonumber(cb[2] or "0")
local cbFailures = tonumber(cb[3] or "0")
local cbAttempts = tonumber(cb[4] or "0")

cbAttempts = cbAttempts + 1

if success == 1 then
  local preservedOpenedUntil = 0
  if openedUntil > 0 and now > openedUntil and (now - openedUntil) < decayPeriodMs then
    preservedOpenedUntil = openedUntil
  end
  redis.call("HSET", cbKey,
    "opened_until_ms", preservedOpenedUntil,
    "cb_window_from", cbWindowFrom,
    "cb_failures", cbFailures,
    "cb_attempts", cbAttempts
  )
  redis.call("EXPIRE", cbKey, math.ceil(cooldownMs / 1000) + 60)
  return { 1, "closed" }
end

cbFailures = cbFailures + 1

local circuitAlreadyOpen = openedUntil > 0 and now < openedUntil

if not circuitAlreadyOpen
  and cbAttempts >= cbMinAttempts
  and (cbFailures / cbAttempts) > cbErrorThreshold then
  redis.call("HSET", cbKey,
    "opened_until_ms", now + cooldownMs,
    "cb_window_from", 0,
    "cb_failures", 0,
    "cb_attempts", 0
  )
  redis.call("EXPIRE", cbKey, math.ceil(cooldownMs / 1000) + 60)
  return { 0, "opened" }
end

redis.call("HSET", cbKey,
  "opened_until_ms", openedUntil,
  "cb_window_from", cbWindowFrom,
  "cb_failures", cbFailures,
  "cb_attempts", cbAttempts
)
redis.call("EXPIRE", cbKey, math.ceil(cooldownMs / 1000) + 60)
return { 0, "failed" }
