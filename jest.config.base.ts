import type { Config } from "jest";

export const baseJestConfig: Config = {
  preset: "ts-jest",
  clearMocks: true,
  collectCoverage: true,
  coverageDirectory: "./.reports/unit/coverage",
  coverageProvider: "v8",
  coveragePathIgnorePatterns: ["/__tests__/", "/node_modules/"],
  transform: { "^.+\\.ts$": "ts-jest" },
  testPathIgnorePatterns: [".build"],
  testMatch: ["**/?(*.)+(spec|test).[jt]s?(x)"],
  reporters: [
    "default",
    [
      "jest-html-reporter",
      {
        pageTitle: "Test Report",
        outputPath: "./.reports/unit/test-report.html",
        includeFailureMsg: true,
      },
    ],
  ],
};

export const nodeJestConfig: Config = {
  ...baseJestConfig,
  testEnvironment: "node",
  modulePaths: ["<rootDir>/src"],
};
