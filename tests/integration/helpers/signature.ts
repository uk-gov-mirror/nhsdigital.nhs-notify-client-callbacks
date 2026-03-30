import { createHmac } from "node:crypto";
import type { CallbackItem } from "@nhs-notify-client-callbacks/models";
import type { SignedCallback } from "./cloudwatch";

function resolveEnvVar(name: string): string {
  const result = process.env[name];
  if (result) {
    return result;
  }
  throw new Error(`Missing ${name} for integration signature verification`);
}

function resolveSigningSecret(
  apiKeyVar: string,
  applicationIdVar: string,
): string {
  return `${resolveEnvVar(applicationIdVar)}.${resolveEnvVar(apiKeyVar)}`;
}

export function computeExpectedSignature(
  payload: CallbackItem,
  apiKeyVar = "MOCK_CLIENT_API_KEY",
  applicationIdVar = "MOCK_CLIENT_APPLICATION_ID",
): string {
  const signingSecret = resolveSigningSecret(apiKeyVar, applicationIdVar);
  return createHmac("sha256", signingSecret)
    .update(JSON.stringify({ data: [payload] }))
    .digest("hex");
}

export function assertCallbackHeaders(
  callback: SignedCallback,
  apiKeyVar = "MOCK_CLIENT_API_KEY",
  applicationIdVar = "MOCK_CLIENT_APPLICATION_ID",
): void {
  expect(callback.headers["x-api-key"]).toBeDefined();
  expect(callback.headers["x-api-key"]).toBe(resolveEnvVar(apiKeyVar));
  expect(callback.headers["x-hmac-sha256-signature"]).toBe(
    computeExpectedSignature(callback.payload, apiKeyVar, applicationIdVar),
  );
}

export default computeExpectedSignature;
