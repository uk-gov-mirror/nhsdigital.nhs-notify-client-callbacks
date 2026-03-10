import { nodeJestConfig } from "../../jest.config.base";

export default {
  ...nodeJestConfig,
  modulePaths: ["<rootDir>"],
  coveragePathIgnorePatterns: [
    ...(nodeJestConfig.coveragePathIgnorePatterns ?? []),
    "/helpers/",
  ],
  moduleNameMapper: {
    "^helpers$": "<rootDir>/helpers/index",
  },
};
