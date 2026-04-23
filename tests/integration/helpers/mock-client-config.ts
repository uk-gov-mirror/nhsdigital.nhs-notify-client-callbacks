import { readFileSync } from "node:fs";
import path from "node:path";
import type seedConfigJson from "../fixtures/subscriptions/mock-client-single-target.json";

type ClientFixtureShape = typeof seedConfigJson;

export type MockItClientConfig = ClientFixtureShape & {
  apiKeyVar: string;
  applicationIdVar: string;
};

export const CLIENT_FIXTURES = {
  clientSingleTarget: {
    fixture: "mock-client-single-target.json",
    apiKeyVar: "MOCK_CLIENT_API_KEY",
    applicationIdVar: "MOCK_CLIENT_APPLICATION_ID",
  },
  clientFanOut: {
    fixture: "mock-client-fan-out.json",
    apiKeyVar: "MOCK_CLIENT_FAN_OUT_API_KEY",
    applicationIdVar: "MOCK_CLIENT_FAN_OUT_APPLICATION_ID",
  },
  clientMtls: {
    fixture: "mock-client-mtls.json",
    apiKeyVar: "MOCK_CLIENT_MTLS_API_KEY",
    applicationIdVar: "MOCK_CLIENT_MTLS_APPLICATION_ID",
  },
  clientRateLimit: {
    fixture: "mock-client-rate-limit.json",
    apiKeyVar: "MOCK_CLIENT_RATE_LIMIT_API_KEY",
    applicationIdVar: "MOCK_CLIENT_RATE_LIMIT_APPLICATION_ID",
  },
  clientCircuitBreaker: {
    fixture: "mock-client-circuit-breaker.json",
    apiKeyVar: "MOCK_CLIENT_CIRCUIT_BREAKER_API_KEY",
    applicationIdVar: "MOCK_CLIENT_CIRCUIT_BREAKER_APPLICATION_ID",
  },
  clientShortRetry: {
    fixture: "mock-client-short-retry.json",
    apiKeyVar: "MOCK_CLIENT_SHORT_RETRY_API_KEY",
    applicationIdVar: "MOCK_CLIENT_SHORT_RETRY_APPLICATION_ID",
  },
} as const;

export type ClientFixtureKey = keyof typeof CLIENT_FIXTURES;

export function getClientConfig(key: ClientFixtureKey): MockItClientConfig {
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

export function getMockItClientConfig(): MockItClientConfig {
  return getClientConfig("clientSingleTarget");
}

function buildWebhookTargetPaths(key: ClientFixtureKey): string[] {
  const config = getClientConfig(key);
  return config.targets.map(({ targetId }) => `/${targetId}`);
}

export function buildMockWebhookTargetPath(
  key: ClientFixtureKey = "clientSingleTarget",
): string {
  const paths = buildWebhookTargetPaths(key);

  if (paths.length === 0) {
    throw new Error(`No webhook targets configured for fixture key: ${key}`);
  }

  return paths[0];
}

export function buildMockWebhookTargetPaths(
  key: ClientFixtureKey = "clientSingleTarget",
): string[] {
  return buildWebhookTargetPaths(key);
}
