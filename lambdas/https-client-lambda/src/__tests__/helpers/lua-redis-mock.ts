import {
  lauxlib,
  lua,
  lualib,
  to_jsstring as toJsstring,
  to_luastring as toLuastring,
} from "fengari";

type LuaState = ReturnType<typeof lauxlib.luaL_newstate>;
type RedisStore = Map<string, Map<string, string>>;

export function createRedisStore(): RedisStore {
  return new Map();
}

function hset(store: RedisStore, key: string, pairs: string[]): number {
  const hash = store.get(key) ?? new Map<string, string>();
  store.set(key, hash);
  let fieldsSet = 0;
  for (let i = 0; i < pairs.length; i += 2) {
    // eslint-disable-next-line security/detect-object-injection -- pairs is a controlled array from redis HSET parsing
    hash.set(pairs[i], pairs[i + 1]);
    fieldsSet += 1;
  }
  return fieldsSet;
}

function redisCallHandler(L: LuaState, store: RedisStore): number {
  const cmd = toJsstring(lua.lua_tostring(L, 1)).toUpperCase();

  if (cmd === "HMGET") {
    const key = toJsstring(lua.lua_tostring(L, 2));
    const nArgs = lua.lua_gettop(L);
    const hash = store.get(key);
    lua.lua_createtable(L, nArgs - 2, 0);
    for (let i = 3; i <= nArgs; i++) {
      const field = toJsstring(lua.lua_tostring(L, i));
      const val = hash?.get(field);
      if (val === undefined) {
        lua.lua_pushboolean(L, 0);
      } else {
        lua.lua_pushstring(L, toLuastring(val));
      }
      lua.lua_rawseti(L, -2, i - 2);
    }
    return 1;
  }

  if (cmd === "HSET") {
    const key = toJsstring(lua.lua_tostring(L, 2));
    const nArgs = lua.lua_gettop(L);
    const pairs: string[] = [];
    for (let i = 3; i <= nArgs; i++) {
      pairs.push(toJsstring(lua.lua_tostring(L, i)));
    }
    const count = hset(store, key, pairs);
    lua.lua_pushinteger(L, count);
    return 1;
  }

  if (cmd === "EXPIRE") {
    lua.lua_pushinteger(L, 1);
    return 1;
  }

  throw new Error(`Unsupported Redis command in mock: ${cmd}`);
}

const CJSON_AND_REDIS_PREAMBLE = `
  cjson = {}
  function cjson.encode(t)
    if t == nil then return "null" end
    if type(t) ~= "table" then
      if type(t) == "string" then return '"' .. t .. '"' end
      if type(t) == "boolean" then return t and "true" or "false" end
      if type(t) == "number" then
        if t == math.floor(t) and t < 1e15 and t > -1e15 then
          return string.format("%d", t)
        end
        return tostring(t)
      end
      return tostring(t)
    end
    local n = #t
    local isArray = n > 0
    if isArray then
      for k in pairs(t) do
        if type(k) ~= "number" or k ~= math.floor(k) or k < 1 or k > n then
          isArray = false
          break
        end
      end
    end
    if isArray then
      local parts = {}
      for i = 1, n do
        parts[#parts + 1] = cjson.encode(t[i])
      end
      return "[" .. table.concat(parts, ",") .. "]"
    end
    local parts = {}
    for k, v in pairs(t) do
      parts[#parts + 1] = '"' .. tostring(k) .. '":' .. cjson.encode(v)
    end
    return "{" .. table.concat(parts, ",") .. "}"
  end

  redis = {}
  function redis.call(cmd, ...)
    return __redis_call(cmd, ...)
  end
`;

function registerRedisCallGlobal(L: LuaState, store: RedisStore): void {
  lua.lua_pushcfunction(L, (ls: LuaState) => redisCallHandler(ls, store));
  lua.lua_setglobal(L, toLuastring("__redis_call"));
}

function installCjsonAndRedisShims(L: LuaState): void {
  lauxlib.luaL_dostring(L, toLuastring(CJSON_AND_REDIS_PREAMBLE));
}

function setStringArrayGlobal(
  L: LuaState,
  name: string,
  values: string[],
): void {
  lua.lua_createtable(L, values.length, 0);
  for (const [i, value] of values.entries()) {
    lua.lua_pushstring(L, toLuastring(value));
    lua.lua_rawseti(L, -2, i + 1);
  }
  lua.lua_setglobal(L, toLuastring(name));
}

function runScript(L: LuaState, script: string): string {
  const wrapped = `local __r = (function()\n${script}\nend)()\nreturn cjson.encode(__r)`;
  const status = lauxlib.luaL_dostring(L, toLuastring(wrapped));
  if (status !== lua.LUA_OK) {
    const errMsg = toJsstring(lua.lua_tostring(L, -1));
    throw new Error(`Lua error: ${errMsg}`);
  }
  return toJsstring(lua.lua_tostring(L, -1));
}

export function evalLua(
  script: string,
  keys: string[],
  argv: string[],
  store: RedisStore,
): unknown {
  const L: LuaState = lauxlib.luaL_newstate();
  lualib.luaL_openlibs(L);

  try {
    registerRedisCallGlobal(L, store);
    installCjsonAndRedisShims(L);
    setStringArrayGlobal(L, "KEYS", keys);
    setStringArrayGlobal(L, "ARGV", argv);
    return JSON.parse(runScript(L, script));
  } finally {
    lua.lua_close(L);
  }
}
