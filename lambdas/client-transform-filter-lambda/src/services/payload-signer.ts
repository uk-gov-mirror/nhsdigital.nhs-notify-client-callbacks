import hmacsha256 from "crypto-js/hmac-sha256";
import type { ClientCallbackPayload } from "@nhs-notify-client-callbacks/models";

export function signPayload(
  payload: ClientCallbackPayload,
  applicationId: string,
  apiKey: string,
): string {
  return hmacsha256(
    JSON.stringify(payload),
    `${applicationId}.${apiKey}`,
  ).toString();
}
