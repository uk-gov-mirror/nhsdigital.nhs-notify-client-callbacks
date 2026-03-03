import { nodeJestConfig } from "../../jest.config.base";

export default {
  ...nodeJestConfig,
  coverageThreshold: {
    global: {
      ...nodeJestConfig.coverageThreshold?.global,
      lines: 100,
      statements: 100,
    },
  },
  coveragePathIgnorePatterns: [
    ...(nodeJestConfig.coveragePathIgnorePatterns ?? []),
    "zod-validators.ts",
  ],
};
