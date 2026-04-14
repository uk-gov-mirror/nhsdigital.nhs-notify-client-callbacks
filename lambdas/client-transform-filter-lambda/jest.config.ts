import { nodeJestConfig } from "../../jest.config.base.ts";

export default {
  ...nodeJestConfig,
  coverageThreshold: {
    global: {
      ...nodeJestConfig.coverageThreshold?.global,
      lines: 99,
      statements: 99,
    },
  },
  coveragePathIgnorePatterns: [
    ...(nodeJestConfig.coveragePathIgnorePatterns ?? []),
    "zod-validators.ts",
  ],
};
