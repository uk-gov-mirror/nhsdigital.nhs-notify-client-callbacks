import { createHmac } from "node:crypto";
import type { ClientCallbackPayload } from "@nhs-notify-client-callbacks/models";

export function signPayload(
  payload: ClientCallbackPayload,
  applicationId: string,
  apiKey: string,
): string {
  return createHmac("sha256", `${applicationId}.${apiKey}`)
    .update(JSON.stringify(payload))
    .digest("hex");
}
