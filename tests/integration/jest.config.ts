import { nodeJestConfig } from "../../jest.config.base";

export default {
  ...nodeJestConfig,
  modulePaths: ["<rootDir>"],
};
