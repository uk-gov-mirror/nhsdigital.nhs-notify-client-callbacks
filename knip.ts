import type { KnipConfig } from "knip";

const config: KnipConfig = {
  ignoreExportsUsedInFile: true,
  // Files inherited from the repository template that are not used in this repo.
  ignoreFiles: [
    "docs/adr/assets/ADR-003/examples/nodejs/main.ts",
    "docs/assets/js/nhs-notify.js",
    "scripts/maintenance/merge.js",
  ],
  workspaces: {
    ".": {
      // jest.config.base.ts is imported by workspace jest configs via relative
      // paths (../../jest.config.base), which knip doesn't trace across workspace
      // boundaries, so declare it explicitly as an entry point.
      entry: ["jest.config.base.ts"],
      ignoreDependencies: [
        // ESLint peer deps – referenced indirectly through plugin configs
        "@stylistic/eslint-plugin",
        "@typescript-eslint/parser",
        // Used in lambdas' lambda-build script via pnpm exec
        "esbuild",
        // Used in scripts/tests/unit.sh (shell script, not scanned by knip)
        "lcov-result-merger",
        // Required as a peer by jest when running .ts config files
        "ts-node",
        // Used in tools/client-subscriptions-management CLI entry-point script
        "tsx",
      ],
    },
    "lambdas/client-transform-filter-lambda": {
      // Resolved transitively through tsconfig.base.json → @tsconfig/node22
      ignoreDependencies: ["@tsconfig/node22"],
    },
    "lambdas/https-client-lambda": {
      ignoreDependencies: ["@tsconfig/node22"],
    },
    "lambdas/mock-webhook-lambda": {
      ignoreDependencies: ["@tsconfig/node22"],
    },
    "src/config-cache": {
      ignoreDependencies: ["@tsconfig/node22"],
    },
    "src/config-subscription-cache": {
      ignoreDependencies: ["@tsconfig/node22"],
    },
    "src/logger": {
      ignoreDependencies: ["@tsconfig/node22"],
    },
    "src/models": {
      ignoreDependencies: ["@tsconfig/node22"],
    },
    "tests/integration": {
      entry: ["helpers/**/*.ts"],
      ignoreDependencies: [
        "@tsconfig/node22",
        // Used in helpers/sqs.ts and helpers/cloudwatch.ts; flagged because
        // those helpers are only consumed by ci-only integration tests
        "async-wait-until",
      ],
    },
    "tests/performance": {
      ignoreDependencies: ["@tsconfig/node22"],
    },
    "tests/test-support": {
      ignoreDependencies: ["@tsconfig/node22"],
    },
  },
};

export default config;
