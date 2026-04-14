import { nodeJestConfig } from "../../jest.config.base.ts";

export default {
  ...nodeJestConfig,
  modulePaths: ["<rootDir>"],
  collectCoverage: false,
  moduleNameMapper: {
    "^helpers$": "<rootDir>/helpers/index",
  },
  // Run performance tests serially to avoid queue contention
  maxWorkers: 1,
  // Force exit after tests complete — real AWS SDK clients keep connections alive
  forceExit: true,
};
