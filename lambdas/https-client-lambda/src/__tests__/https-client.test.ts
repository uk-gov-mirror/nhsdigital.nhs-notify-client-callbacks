/* eslint-disable unicorn/prefer-event-target -- Node.js http module mock requires EventEmitter API */
import { EventEmitter } from "node:events";
import https, { Agent } from "node:https";
import type { CallbackTarget } from "@nhs-notify-client-callbacks/models";

import { deliverPayload } from "services/delivery/https-client";

jest.mock("services/delivery/tls-agent-factory", () => ({
  PERMANENT_TLS_ERROR_CODES: new Set([
    "CERT_HAS_EXPIRED",
    "DEPTH_ZERO_SELF_SIGNED_CERT",
    "ERR_CERT_PINNING_FAILED",
    "ERR_TLS_CERT_ALTNAME_INVALID",
    "SELF_SIGNED_CERT_IN_CHAIN",
    "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
  ]),
}));

const createTarget = (): CallbackTarget => ({
  targetId: "target-1",
  type: "API",
  invocationEndpoint: "https://webhook.example.invalid:8443/callback",
  invocationMethod: "POST",
  invocationRateLimit: 10,
  apiKey: { headerName: "x-api-key", headerValue: "secret" },
});

const createMockAgent = () => ({}) as Agent;

type MockResponse = EventEmitter & {
  statusCode: number;
  headers: Record<string, string | undefined>;
  resume: jest.Mock;
};

function mockHttpsRequest(
  statusCode: number,
  headers: Record<string, string | undefined> = {},
) {
  const mockReq = new EventEmitter() as EventEmitter & {
    end: jest.Mock;
    destroy: jest.Mock;
  };
  mockReq.end = jest.fn();
  mockReq.destroy = jest.fn();

  jest.spyOn(https, "request").mockImplementation((...args: unknown[]) => {
    const callback = args.find((a) => typeof a === "function") as
      | ((res: MockResponse) => void)
      | undefined;

    const res: MockResponse = Object.assign(new EventEmitter(), {
      statusCode,
      headers,
      resume: jest.fn(),
    });

    if (callback) {
      process.nextTick(() => callback(res));
    }

    return mockReq as unknown as ReturnType<typeof https.request>;
  });

  return mockReq;
}

function mockHttpsRequestError(errorCode: string) {
  const mockReq = new EventEmitter() as EventEmitter & {
    end: jest.Mock;
    destroy: jest.Mock;
  };
  mockReq.end = jest.fn();
  mockReq.destroy = jest.fn();

  jest.spyOn(https, "request").mockImplementation(() => {
    process.nextTick(() => {
      const error = new Error("TLS error") as NodeJS.ErrnoException;
      error.code = errorCode;
      mockReq.emit("error", error);
    });

    return mockReq as unknown as ReturnType<typeof https.request>;
  });

  return mockReq;
}

function mockHttpsRequestTimeout() {
  const mockReq = new EventEmitter() as EventEmitter & {
    end: jest.Mock;
    destroy: jest.Mock;
  };
  mockReq.end = jest.fn();
  mockReq.destroy = jest.fn((error?: Error) => {
    if (error) {
      process.nextTick(() => mockReq.emit("error", error));
    }
  });

  jest.spyOn(https, "request").mockImplementation(() => {
    process.nextTick(() => mockReq.emit("timeout"));
    return mockReq as unknown as ReturnType<typeof https.request>;
  });

  return mockReq;
}

describe("deliverPayload", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("returns success on 2xx", async () => {
    mockHttpsRequest(200);

    const result = await deliverPayload(
      createTarget(),
      '{"test":true}',
      "sig-abc",
      createMockAgent(),
    );

    expect(result).toEqual({ outcome: "success" });
  });

  it("returns permanent_failure on 4xx non-429", async () => {
    mockHttpsRequest(400);

    const result = await deliverPayload(
      createTarget(),
      '{"test":true}',
      "sig-abc",
      createMockAgent(),
    );

    expect(result).toEqual({ outcome: "permanent_failure" });
  });

  it("returns permanent_failure on TLS error CERT_HAS_EXPIRED", async () => {
    mockHttpsRequestError("CERT_HAS_EXPIRED");

    const result = await deliverPayload(
      createTarget(),
      '{"test":true}',
      "sig-abc",
      createMockAgent(),
    );

    expect(result).toEqual({ outcome: "permanent_failure" });
  });

  it("returns permanent_failure on TLS pinning error", async () => {
    mockHttpsRequestError("ERR_CERT_PINNING_FAILED");

    const result = await deliverPayload(
      createTarget(),
      '{"test":true}',
      "sig-abc",
      createMockAgent(),
    );

    expect(result).toEqual({ outcome: "permanent_failure" });
  });

  it("returns transient_failure on 5xx", async () => {
    mockHttpsRequest(503);

    const result = await deliverPayload(
      createTarget(),
      '{"test":true}',
      "sig-abc",
      createMockAgent(),
    );

    expect(result).toEqual({ outcome: "transient_failure", statusCode: 503 });
  });

  it("returns rate_limited with Retry-After header value", async () => {
    mockHttpsRequest(429, { "retry-after": "60" });

    const result = await deliverPayload(
      createTarget(),
      '{"test":true}',
      "sig-abc",
      createMockAgent(),
    );

    expect(result).toEqual({
      outcome: "rate_limited",
      retryAfterHeader: "60",
    });
  });

  it("returns rate_limited with undefined retryAfterHeader when header is absent", async () => {
    mockHttpsRequest(429);

    const result = await deliverPayload(
      createTarget(),
      '{"test":true}',
      "sig-abc",
      createMockAgent(),
    );

    expect(result).toEqual({
      outcome: "rate_limited",
      retryAfterHeader: undefined,
    });
  });

  it("returns transient_failure on TCP error", async () => {
    mockHttpsRequestError("ECONNREFUSED");

    const result = await deliverPayload(
      createTarget(),
      '{"test":true}',
      "sig-abc",
      createMockAgent(),
    );

    expect(result).toEqual({ outcome: "transient_failure", statusCode: 0 });
  });

  it("uses port 443 when URL has no explicit port", async () => {
    mockHttpsRequest(200);
    const target = createTarget();
    target.invocationEndpoint = "https://webhook.example.invalid/callback";

    const result = await deliverPayload(
      target,
      '{"test":true}',
      "sig-abc",
      createMockAgent(),
    );

    expect(result).toEqual({ outcome: "success" });
    const callUrl = (https.request as jest.Mock).mock.calls[0][0] as URL;
    expect(callUrl).toBeInstanceOf(URL);
    expect(callUrl.port).toBe("");
  });

  it("returns transient failure on request timeout", async () => {
    mockHttpsRequestTimeout();

    const result = await deliverPayload(
      createTarget(),
      '{"test":true}',
      "sig-abc",
      createMockAgent(),
    );

    expect(result).toEqual({ outcome: "transient_failure", statusCode: 0 });
  });

  it("treats undefined statusCode as transient failure with code 0", async () => {
    const mockReq = new EventEmitter() as EventEmitter & {
      end: jest.Mock;
      destroy: jest.Mock;
    };
    mockReq.end = jest.fn();
    mockReq.destroy = jest.fn();

    jest.spyOn(https, "request").mockImplementation((...args: unknown[]) => {
      const callback = args.find((a) => typeof a === "function") as
        | ((res: MockResponse) => void)
        | undefined;

      const res: MockResponse = Object.assign(new EventEmitter(), {
        statusCode: undefined as unknown as number,
        headers: {},
        resume: jest.fn(),
      });

      if (callback) {
        process.nextTick(() => callback(res));
      }

      return mockReq as unknown as ReturnType<typeof https.request>;
    });

    const result = await deliverPayload(
      createTarget(),
      '{"test":true}',
      "sig-abc",
      createMockAgent(),
    );

    expect(result).toEqual({ outcome: "transient_failure", statusCode: 0 });
  });
});
