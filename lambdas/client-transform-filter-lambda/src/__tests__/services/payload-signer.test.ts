import { createHmac } from "node:crypto";
import type { ClientCallbackPayload } from "@nhs-notify-client-callbacks/models";
import { signPayload } from "services/payload-signer";

const makePayload = (id = "msg-1") =>
  ({ data: [{ id }] }) as unknown as ClientCallbackPayload;

describe("signPayload", () => {
  it("produces the expected HMAC-SHA256 hex string", () => {
    const payload = makePayload();
    const applicationId = "app-id-1";
    const apiKey = "api-key-1";

    const expected = createHmac("sha256", `${applicationId}.${apiKey}`)
      .update(JSON.stringify(payload))
      .digest("hex");

    expect(signPayload(payload, applicationId, apiKey)).toBe(expected);
  });

  it("returns a non-empty hex string", () => {
    const result = signPayload(makePayload(), "app-id", "api-key");
    expect(result).toMatch(/^[0-9a-f]+$/);
  });

  it("produces different signatures for different payloads", () => {
    const apiKey = "key";
    const appId = "app";
    expect(signPayload(makePayload("msg-1"), appId, apiKey)).not.toBe(
      signPayload(makePayload("msg-2"), appId, apiKey),
    );
  });

  it("produces different signatures for different applicationIds", () => {
    const payload = makePayload();
    const apiKey = "key";
    expect(signPayload(payload, "app-1", apiKey)).not.toBe(
      signPayload(payload, "app-2", apiKey),
    );
  });

  it("produces different signatures for different apiKeys", () => {
    const payload = makePayload();
    const appId = "app";
    expect(signPayload(payload, appId, "key-1")).not.toBe(
      signPayload(payload, appId, "key-2"),
    );
  });
});
