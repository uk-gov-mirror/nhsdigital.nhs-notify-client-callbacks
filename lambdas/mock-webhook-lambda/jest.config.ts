import { nodeJestConfig } from "../../jest.config.base";

export default {
  ...nodeJestConfig,
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 100,
      lines: 100,
      statements: -10,
    },
  },
  coveragePathIgnorePatterns: [
    ...(nodeJestConfig.coveragePathIgnorePatterns ?? []),
    "zod-validators.ts",
  ],
};
