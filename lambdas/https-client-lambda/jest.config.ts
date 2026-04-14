import { nodeJestConfig } from "../../jest.config.base.ts";

export default {
  ...nodeJestConfig,
  transform: {
    ...nodeJestConfig.transform,
    "\\.lua$": "<rootDir>/lua-transform.js",
  },
};
