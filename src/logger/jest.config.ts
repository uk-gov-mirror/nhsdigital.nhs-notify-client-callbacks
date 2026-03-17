import { nodeJestConfig } from "../../jest.config.base";

export default {
  ...nodeJestConfig,
  coverageThreshold: {
    global: {
      ...nodeJestConfig.coverageThreshold?.global,
      branches: 100,
      functions: 100,
      lines: 100,
      statements: 100,
    },
  },
};
