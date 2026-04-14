import { readFileSync } from "node:fs";
import path from "node:path";
import type seedConfigJson from "../fixtures/subscriptions/mock-client-1.json";

type ClientFixtureShape = typeof seedConfigJson;

export type MockItClientConfig = ClientFixtureShape & {
  apiKeyVar: string;
  applicationIdVar: string;
};

export const CLIENT_FIXTURES = {
  client1: {
    fixture: "mock-client-1.json",
    apiKeyVar: "MOCK_CLIENT_API_KEY",
    applicationIdVar: "MOCK_CLIENT_APPLICATION_ID",
  },
  client2: {
    fixture: "mock-client-2.json",
    apiKeyVar: "MOCK_CLIENT_2_API_KEY",
    applicationIdVar: "MOCK_CLIENT_2_APPLICATION_ID",
  },
  clientMtls: {
    fixture: "mock-client-mtls.json",
    apiKeyVar: "MOCK_CLIENT_MTLS_API_KEY",
    applicationIdVar: "MOCK_CLIENT_MTLS_APPLICATION_ID",
  },
} as const;

export type ClientFixtureKey = keyof typeof CLIENT_FIXTURES;

const ALL_CLIENT_FIXTURE_KEYS = Object.keys(
  CLIENT_FIXTURES,
) as ClientFixtureKey[];

function dedupe(values: string[]): string[] {
  return [...new Set(values)];
}

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
  return getClientConfig("client1");
}

export function getMockItClient2Config(): MockItClientConfig {
  return getClientConfig("client2");
}

function buildWebhookTargetPaths(key: ClientFixtureKey): string[] {
  const config = getClientConfig(key);
  return config.targets.map(({ targetId }) => `/${targetId}`);
}

export function buildMockWebhookTargetPath(
  key: ClientFixtureKey = "client1",
): string {
  const paths = buildWebhookTargetPaths(key);

  if (paths.length === 0) {
    throw new Error(`No webhook targets configured for fixture key: ${key}`);
  }

  return paths[0];
}

export function buildMockWebhookTargetPaths(
  key: ClientFixtureKey = "client1",
): string[] {
  return buildWebhookTargetPaths(key);
}

export function getSubscriptionTargetIds(
  key: ClientFixtureKey = "client1",
): string[] {
  const config = getClientConfig(key);
  return dedupe(
    config.subscriptions.flatMap((subscription) => subscription.targetIds),
  );
}

export function getAllSubscriptionTargetIds(
  keys: ClientFixtureKey[] = ALL_CLIENT_FIXTURE_KEYS,
): string[] {
  return dedupe(keys.flatMap((key) => getSubscriptionTargetIds(key)));
}
