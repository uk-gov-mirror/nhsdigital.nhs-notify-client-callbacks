-- KEYS[1] = cb:{endpoint}
-- ARGV[1] = now_ms
-- ARGV[2] = success (1 or 0)
-- ARGV[3] = failure_threshold
-- ARGV[4] = cooldown_ms
-- ARGV[5] = decay_period_ms

local cbKey = KEYS[1]
local now = tonumber(ARGV[1])
local success = tonumber(ARGV[2])
local failureThreshold = tonumber(ARGV[3])
local cooldownMs = tonumber(ARGV[4])
local decayPeriodMs = tonumber(ARGV[5])

local cb = redis.call("HMGET", cbKey, "state", "failures", "opened_until_ms", "probe_in_flight")
local state = cb[1] or "closed"
local failures = tonumber(cb[2] or "0")
local openedUntil = tonumber(cb[3] or "0")

if success == 1 then
  local preservedOpenedUntil = 0
  if openedUntil > 0 and now > openedUntil and (now - openedUntil) < decayPeriodMs then
    preservedOpenedUntil = openedUntil
  end
  redis.call("HSET", cbKey,
    "state", "closed",
    "failures", 0,
    "opened_until_ms", preservedOpenedUntil,
    "probe_in_flight", 0
  )
  redis.call("EXPIRE", cbKey, math.ceil(cooldownMs / 1000) + 60)
  return { 1, "closed" }
end

failures = failures + 1

if state == "half_open" or failures >= failureThreshold then
  redis.call("HSET", cbKey,
    "state", "open",
    "failures", failures,
    "opened_until_ms", now + cooldownMs,
    "probe_in_flight", 0
  )
  redis.call("EXPIRE", cbKey, math.ceil(cooldownMs / 1000) + 60)
  return { 0, "opened" }
end

redis.call("HSET", cbKey,
  "state", state,
  "failures", failures,
  "opened_until_ms", openedUntil,
  "probe_in_flight", 0
)
redis.call("EXPIRE", cbKey, math.ceil(cooldownMs / 1000) + 60)
return { 0, "failed" }
