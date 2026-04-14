import { createHmac } from "node:crypto";
import { signPayload } from "services/payload-signer";

const makePayload = () =>
  ({
    data: [
      { type: "MessageStatus", attributes: { messageStatus: "delivered" } },
    ],
  }) as Parameters<typeof signPayload>[2];

describe("signPayload", () => {
  it("produces correct HMAC-SHA256 output for a known input", () => {
    const payload = makePayload();
    // eslint-disable-next-line sonarjs/hardcoded-secret-signatures -- test fixture, not a real secret
    const expected = createHmac("sha256", "app-1.key-1")
      .update(JSON.stringify(payload))
      .digest("hex");

    expect(signPayload("app-1", "key-1", payload)).toBe(expected);
  });

  it("produces different signatures for different appId/apiKey combinations", () => {
    const payload = makePayload();

    const sig1 = signPayload("app-1", "key-1", payload);
    const sig2 = signPayload("app-2", "key-2", payload);

    expect(sig1).not.toBe(sig2);
  });

  it("produces the same signature for the same inputs", () => {
    const payload = makePayload();

    const sig1 = signPayload("app-1", "key-1", payload);
    const sig2 = signPayload("app-1", "key-1", payload);

    expect(sig1).toBe(sig2);
  });

  it("produces a deterministic non-empty signature for an empty payload object", () => {
    const emptyPayload = {} as Parameters<typeof signPayload>[2];

    const sig = signPayload("app-1", "key-1", emptyPayload);

    expect(sig).toBeTruthy();
    expect(typeof sig).toBe("string");
    expect(sig.length).toBeGreaterThan(0);

    const sig2 = signPayload("app-1", "key-1", emptyPayload);
    expect(sig).toBe(sig2);
  });
});
