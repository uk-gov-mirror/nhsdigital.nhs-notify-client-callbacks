import { readFileSync } from "node:fs";
import path from "node:path";
import type seedConfigJson from "../fixtures/subscriptions/mock-client-1.json";

type ClientFixtureShape = typeof seedConfigJson;

export type RegressionClientConfig = ClientFixtureShape & {
  apiKeyVar: string;
  applicationIdVar: string;
};

export const CLIENT_FIXTURES = {
  regression: {
    fixture: "mock-client-1.json",
    apiKeyVar: "MOCK_CLIENT_REGRESSION_API_KEY",
    applicationIdVar: "MOCK_CLIENT_REGRESSION_APPLICATION_ID",
  },
} as const;

export type ClientFixtureKey = keyof typeof CLIENT_FIXTURES;

export function getClientConfig(key: ClientFixtureKey): RegressionClientConfig {
  // eslint-disable-next-line security/detect-object-injection -- key is constrained to ClientFixtureKey, a keyof the hardcoded as-const CLIENT_FIXTURES object
  const { apiKeyVar, applicationIdVar, fixture } = CLIENT_FIXTURES[key];
  const resolved = path.resolve(
    __dirname,
    "..",
    "fixtures",
    "subscriptions",
    fixture,
  );
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- path is constructed from __dirname and a basename sourced from the hardcoded as-const CLIENT_FIXTURES registry
  const data = JSON.parse(readFileSync(resolved, "utf8")) as ClientFixtureShape;
  return { ...data, apiKeyVar, applicationIdVar };
}

export function getRegressionClientConfig(): RegressionClientConfig {
  return getClientConfig("regression");
}

export function buildMockWebhookTargetPath(): string {
  const config = getRegressionClientConfig();
  const paths = config.targets.map(({ targetId }) => `/${targetId}`);

  if (paths.length === 0) {
    throw new Error("No webhook targets configured for regression fixture");
  }

  return paths[0];
}

export function buildMockWebhookTargetPaths(): string[] {
  const config = getRegressionClientConfig();
  return config.targets.map(({ targetId }) => `/${targetId}`);
}

export function getSubscriptionTargetIds(): string[] {
  const config = getRegressionClientConfig();
  return [
    ...new Set(
      config.subscriptions.flatMap((subscription) => subscription.targetIds),
    ),
  ];
}
