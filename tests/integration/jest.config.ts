import { nodeJestConfig } from "../../jest.config.base";

export default {
  ...nodeJestConfig,
  modulePaths: ["<rootDir>"],
  globalSetup: "<rootDir>/jest.global-setup.ts",
  globalTeardown: "<rootDir>/jest.global-teardown.ts",
  coveragePathIgnorePatterns: [
    ...(nodeJestConfig.coveragePathIgnorePatterns ?? []),
    "/helpers/",
  ],
  moduleNameMapper: {
    "^helpers$": "<rootDir>/helpers/index",
  },
  setupFilesAfterEnv: [
    ...(nodeJestConfig.setupFilesAfterEnv ?? []),
    "<rootDir>/jest.setup.ts",
  ],
  // Run integration tests serially to avoid queue contention
  maxWorkers: 1,
};
