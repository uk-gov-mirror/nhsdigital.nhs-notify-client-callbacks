import type { Config } from "jest";

const jestConfig: Config = {
  preset: "ts-jest",
  clearMocks: true,
  silent: true,
  collectCoverage: true,
  coverageDirectory: "./.reports/unit/coverage",
  coverageProvider: "babel",
  coveragePathIgnorePatterns: ["/__tests__/"],
  transform: { "^.+\\.ts$": "ts-jest" },
  testPathIgnorePatterns: [String.raw`\.build`],
  testMatch: ["**/?(*.)+(spec|test).[jt]s?(x)"],
  testEnvironment: "node",
  modulePaths: ["<rootDir>/src"],
  moduleNameMapper: {
    "^src/(.*)$": "<rootDir>/src/$1",
  },
  coverageThreshold: {
    global: {
      branches: 100,
      functions: 100,
      lines: 100,
      statements: 100,
    },
  },
};

export default jestConfig;
