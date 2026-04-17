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

function hget(
  store: RedisStore,
  key: string,
  field: string,
): string | undefined {
  return store.get(key)?.get(field);
}

function hset(store: RedisStore, ...args: string[]): number {
  const key = args[0];
  const hash = store.get(key) ?? new Map<string, string>();
  store.set(key, hash);
  let fieldsSet = 0;
  for (let i = 1; i < args.length; i += 2) {
    // eslint-disable-next-line security/detect-object-injection -- args is a controlled array from redis HSET parsing
    hash.set(args[i], args[i + 1]);
    fieldsSet += 1;
  }
  return fieldsSet;
}

function redisCallHandler(L: LuaState, store: RedisStore): number {
  const cmd = toJsstring(lua.lua_tostring(L, 1)).toUpperCase();
  if (cmd === "HGET") {
    const key = toJsstring(lua.lua_tostring(L, 2));
    const field = toJsstring(lua.lua_tostring(L, 3));
    const val = hget(store, key, field);
    if (val === undefined) {
      lua.lua_pushboolean(L, 0);
    } else {
      lua.lua_pushstring(L, toLuastring(val));
    }
    return 1;
  }
  if (cmd === "HSET") {
    const nArgs = lua.lua_gettop(L);
    const args: string[] = [];
    for (let i = 2; i <= nArgs; i++) {
      args.push(toJsstring(lua.lua_tostring(L, i)));
    }
    const count = hset(store, ...args);
    lua.lua_pushinteger(L, count);
    return 1;
  }
  throw new Error(`Unsupported Redis command in mock: ${cmd}`);
}

const CJSON_AND_REDIS_PREAMBLE = `
  cjson = {}
  function cjson.encode(t)
    if type(t) ~= "table" then return tostring(t) end
    local parts = {}
    for k, v in pairs(t) do
      local key = '"' .. tostring(k) .. '"'
      local val
      if type(v) == "boolean" then
        val = v and "true" or "false"
      elseif type(v) == "number" then
        if v == math.floor(v) and v < 1e15 and v > -1e15 then
          val = string.format("%d", v)
        else
          val = tostring(v)
        end
      elseif type(v) == "string" then
        val = '"' .. v .. '"'
      else
        val = tostring(v)
      end
      parts[#parts + 1] = key .. ":" .. val
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
  const status = lauxlib.luaL_dostring(L, toLuastring(script));
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
