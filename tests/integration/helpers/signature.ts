import { createHmac } from "node:crypto";
import type { CallbackItem } from "@nhs-notify-client-callbacks/models";

const MOCK_HMAC_SECRET = "mock-application-id.some-api-key";

export function computeExpectedSignature(payload: CallbackItem): string {
  // eslint-disable-next-line sonarjs/hardcoded-secret-signatures
  return createHmac("sha256", MOCK_HMAC_SECRET)
    .update(JSON.stringify({ data: [payload] }))
    .digest("hex");
}

export default computeExpectedSignature;
