import { nodeJestConfig } from "../../jest.config.base";

export default {
  ...nodeJestConfig,
  modulePaths: ["<rootDir>"],
  coveragePathIgnorePatterns: [
    ...(nodeJestConfig.coveragePathIgnorePatterns ?? []),
    "/helpers/",
    "/fixtures/",
  ],
  setupFilesAfterEnv: [
    ...(nodeJestConfig.setupFilesAfterEnv ?? []),
    "<rootDir>/jest.setup.ts",
  ],
  globalSetup: "<rootDir>/jest.global-setup.ts",
  globalTeardown: "<rootDir>/jest.global-teardown.ts",
  maxWorkers: 1,
  forceExit: true,
  collectCoverage: false,
  coverageThreshold: undefined,
};
