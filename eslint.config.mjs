import jest from "eslint-plugin-jest";
import jsxA11y from "eslint-plugin-jsx-a11y";
import prettierRecommended from "eslint-plugin-prettier/recommended";
import { importX } from "eslint-plugin-import-x";
import * as eslintImportResolverTypescript from "eslint-import-resolver-typescript";
import noRelativeImportPaths from "eslint-plugin-no-relative-import-paths";
import security from "eslint-plugin-security";
import sonarjs from "eslint-plugin-sonarjs";
import json from "eslint-plugin-json";
import unicorn from "eslint-plugin-unicorn";
import { defineConfig, globalIgnores } from "eslint/config";
import js from "@eslint/js";
import html from "eslint-plugin-html";
import tseslint from "typescript-eslint";
import sortDestructureKeys from "eslint-plugin-sort-destructure-keys";
import {
  configs as airbnbConfigs,
  plugins as airbnbPlugins,
} from "eslint-config-airbnb-extended";
import { rules as prettierConfigRules } from "eslint-config-prettier";

export default defineConfig([
  globalIgnores([
    "**/*/coverage/*",
    "**/.build",
    "**/node_modules",
    "**/dist",
    "**/test-results",
    "**/playwright-report*",
    "eslint.config.mjs",
  ]),

  //imports
  importX.flatConfigs.recommended,
  { rules: { ...airbnbPlugins.importX.rules } },

  // js
  js.configs.recommended,
  airbnbPlugins.stylistic,
  airbnbConfigs.base.recommended,

  // ts
  tseslint.configs.strictTypeChecked,
  tseslint.configs.stylisticTypeChecked,
  airbnbConfigs.base.typescript,
  airbnbPlugins.typescriptEslint,

  {
    ignores: ["**/*.json"],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },

  {
    files: ["**/*.json"],
    extends: [tseslint.configs.disableTypeChecked],
  },

  {
    settings: {
      "import-x/resolver-next": [
        eslintImportResolverTypescript.createTypeScriptImportResolver({
          project: [
            "frontend/tsconfig.json",
            "lambdas/*/tsconfig.json",
            "tests/test-team/tsconfig.json",
            "utils/*/tsconfig.json",
          ],
        }),
      ],
    },
  },

  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        2,
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
        },
      ],
      "@typescript-eslint/consistent-type-definitions": 0,
    },
  },

  // unicorn
  unicorn.configs["recommended"],
  {
    rules: {
      "unicorn/prevent-abbreviations": 0,
      "unicorn/filename-case": [
        2,
        {
          case: "kebabCase",
          ignore: [".tsx"],
        },
      ],
      "unicorn/no-null": 0,
      "unicorn/no-useless-undefined": 0,
      "unicorn/prefer-module": 0,
      "unicorn/import-style": [
        2,
        {
          styles: {
            path: {
              named: true,
            },
          },
        },
      ],
    },
  },

  // jest
  jest.configs["flat/recommended"],

  // prettier
  prettierRecommended,
  { rules: { ...prettierConfigRules, "prettier/prettier": 2 } },

  // jsxA11y
  {
    files: ["**/*.{js,mjs,cjs,jsx,mjsx,ts,tsx,mtsx}"],
    plugins: {
      "jsx-a11y": jsxA11y,
    },
    languageOptions: {
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
  },

  // security
  security.configs.recommended,

  // sonar
  sonarjs.configs.recommended,

  // html
  {
    files: ["**/*.html"],
    plugins: { html },
  },

  // json
  {
    files: ["**/*.json"],
    ...json.configs["recommended"],
  },

  // destructure sorting
  {
    name: "eslint-plugin-sort-destructure-keys",
    plugins: {
      "sort-destructure-keys": sortDestructureKeys,
    },
    rules: {
      "sort-destructure-keys/sort-destructure-keys": 2,
    },
  },

  // imports
  {
    rules: {
      "sort-imports": [
        2,
        {
          ignoreDeclarationSort: true,
        },
      ],
      "import-x/extensions": 0,
    },
  },
  {
    files: ["**/*.ts", "**/*.tsx"],
    rules: {
      "import-x/no-unresolved": 0, // trust the typescript compiler to catch unresolved imports
    },
  },
  {
    files: ["tests/test-team/**"],
    rules: {
      "import-x/no-extraneous-dependencies": [
        2,
        {
          devDependencies: true,
        },
      ],
    },
  },
  {
    files: ["**/utils/**", "tests/test-team/**", "lambdas/**/src/**"],
    rules: {
      "import-x/prefer-default-export": 0,
    },
  },
  {
    plugins: {
      "no-relative-import-paths": noRelativeImportPaths,
    },
    rules: {
      "no-relative-import-paths/no-relative-import-paths": 2,
    },
  },
  {
    // Files inside helpers/ are loaded transitively by globalSetup/globalTeardown which run
    // outside Jest's module system, so moduleNameMapper does not apply — relative imports only
    files: ["tests/integration/helpers/**"],
    rules: {
      "no-relative-import-paths/no-relative-import-paths": 0,
    },
  },
  {
    // globalSetup/globalTeardown run outside Jest's module system so moduleNameMapper
    // does not apply — relative imports are the only way to reach local helpers
    files: [
      "tests/integration/jest.global-setup.ts",
      "tests/integration/jest.global-teardown.ts",
    ],
    rules: {
      "no-relative-import-paths/no-relative-import-paths": 0,
    },
  },
  {
    // models src uses relative imports for node16 moduleResolution compatibility
    files: ["src/models/src/**"],
    rules: {
      "no-relative-import-paths/no-relative-import-paths": 0,
    },
    settings: {
      "import-x/resolver": {
        typescript: {
          project: ["src/models/tsconfig.json"],
        },
      },
    },
  },
  {
    files: ["**/jest.config.ts"],
    rules: {
      "no-relative-import-paths/no-relative-import-paths": 0,
      "import-x/no-relative-packages": 0,
    },
  },
  {
    files: ["scripts/**"],
    rules: {
      "import-x/no-extraneous-dependencies": [
        "error",
        { devDependencies: true },
      ],
    },
  },
  {
    files: ["tools/client-subscriptions-management/**/*.ts"],
    rules: {
      "no-console": "off",
      "import-x/first": "off",
    },
  },
  {
    files: ["lambdas/client-transform-filter-lambda/**/*.ts"],
    rules: {
      "no-console": "off",
      "import-x/first": "off",
    },
  },

  // misc rule overrides
  {
    rules: {
      "no-restricted-syntax": 0,
      "no-underscore-dangle": 0,
      "no-await-in-loop": 0,
      "no-plusplus": [2, { allowForLoopAfterthoughts: true }],
      "unicorn/prefer-top-level-await": 0, // top level await is not available in commonjs
    },
  },
]);
