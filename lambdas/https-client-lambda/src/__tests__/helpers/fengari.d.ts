declare module "fengari" {
  type LuaState = object;

  const lua: {
    LUA_OK: number;
    lua_close(L: LuaState): void;
    lua_createtable(L: LuaState, narr: number, nrec: number): void;
    lua_getglobal(L: LuaState, name: Uint8Array): number;
    lua_gettop(L: LuaState): number;
    lua_pushboolean(L: LuaState, b: number): void;
    lua_pushcfunction(L: LuaState, fn: (L: LuaState) => number): void;
    lua_pushinteger(L: LuaState, n: number): void;
    lua_pushstring(L: LuaState, s: Uint8Array): void;
    lua_rawseti(L: LuaState, idx: number, n: number): void;
    lua_setglobal(L: LuaState, name: Uint8Array): void;
    lua_tostring(L: LuaState, idx: number): Uint8Array;
  };

  const lauxlib: {
    luaL_dostring(L: LuaState, s: Uint8Array): number;
    luaL_newstate(): LuaState;
  };

  const lualib: {
    luaL_openlibs(L: LuaState): void;
  };

  // eslint-disable-next-line @typescript-eslint/naming-convention -- fengari uses snake_case names
  function to_jsstring(s: Uint8Array): string;
  // eslint-disable-next-line @typescript-eslint/naming-convention -- fengari uses snake_case names
  function to_luastring(s: string): Uint8Array;
}
