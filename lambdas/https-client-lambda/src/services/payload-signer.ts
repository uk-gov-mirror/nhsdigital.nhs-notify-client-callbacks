import { createHmac } from "node:crypto";
import type { ClientCallbackPayload } from "@nhs-notify-client-callbacks/models";

export function signPayload(
  applicationId: string,
  apiKey: string,
  payload: ClientCallbackPayload,
): string {
  return createHmac("sha256", `${applicationId}.${apiKey}`)
    .update(JSON.stringify(payload))
    .digest("hex");
}
