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
};

export default jestConfig;
