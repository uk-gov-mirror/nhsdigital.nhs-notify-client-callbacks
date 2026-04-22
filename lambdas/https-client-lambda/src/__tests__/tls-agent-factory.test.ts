import type { CallbackTarget } from "@nhs-notify-client-callbacks/models";

const mockS3Send = jest.fn();
jest.mock("@aws-sdk/client-s3", () => {
  const actual = jest.requireActual("@aws-sdk/client-s3");
  return {
    ...actual,
    S3Client: jest.fn().mockImplementation(() => ({ send: mockS3Send })),
  };
});

const mockSecretsManagerSend = jest.fn();
jest.mock("@aws-sdk/client-secrets-manager", () => {
  const actual = jest.requireActual("@aws-sdk/client-secrets-manager");
  return {
    ...actual,
    SecretsManagerClient: jest
      .fn()
      .mockImplementation(() => ({ send: mockSecretsManagerSend })),
  };
});

jest.mock("@nhs-notify-client-callbacks/logger", () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock("node-forge", () => ({
  pem: {
    decode: jest.fn((input: string) => {
      const matches = [
        ...(input ?? "").matchAll(
          /-----BEGIN ([^-]+)-----[\s\S]*?-----END [^-]+-----/g,
        ),
      ];
      return matches.map((match) => ({
        type: (match[1] ?? "").trim(),
        body: "",
      }));
    }),
    encode: jest.fn(
      (obj: { type: string }) =>
        `-----BEGIN ${obj.type}-----\nZmFrZQ==\n-----END ${obj.type}-----\n`,
    ),
  },
}));

const mockValidTo = new Date(Date.now() + 365 * 86_400_000).toISOString();

jest.mock("node:crypto", () => {
  const actual = jest.requireActual("node:crypto");
  return {
    ...actual,
    X509Certificate: class MockX509Certificate {
      validTo = mockValidTo;

      publicKey = {
        export: () => Buffer.from("mock-spki-der"),
      };
    },
  };
});

const TEST_KEY =
  "-----BEGIN PRIVATE KEY-----\nfake-key\n-----END PRIVATE KEY-----"; // gitleaks:allow
const TEST_CERT =
  "-----BEGIN CERTIFICATE-----\nfake-cert\n-----END CERTIFICATE-----";
const COMBINED_PEM = `${TEST_KEY}\n${TEST_CERT}`;

const createTarget = (
  overrides: Partial<CallbackTarget> = {},
): CallbackTarget => ({
  targetId: "target-1",
  type: "API",
  invocationEndpoint: "https://webhook.example.invalid",
  invocationMethod: "POST",
  invocationRateLimit: 10,
  apiKey: { headerName: "x-api-key", headerValue: "secret" },
  ...overrides,
});

const mockS3PemResponse = (pem: string) => {
  mockS3Send.mockResolvedValue({
    Body: { transformToString: jest.fn().mockResolvedValue(pem) },
  });
};

describe("tls-agent-factory", () => {
  let buildAgent: typeof import("services/delivery/tls-agent-factory").buildAgent;
  let resetCache: typeof import("services/delivery/tls-agent-factory").resetCache;

  beforeEach(async () => {
    jest.resetModules();

    delete process.env.MTLS_CERT_SECRET_ARN;
    process.env.MTLS_TEST_CERT_S3_BUCKET = "test-certs-bucket";
    process.env.MTLS_TEST_CERT_S3_KEY = "client.pem";
    delete process.env.MTLS_TEST_CA_S3_KEY;
    process.env.CERT_EXPIRY_THRESHOLD_MS = "86400000";

    // @ts-expect-error -- modulePaths resolves at runtime
    const mod = await import("services/delivery/tls-agent-factory");
    buildAgent = mod.buildAgent;
    resetCache = mod.resetCache;

    mockS3Send.mockReset();
    mockSecretsManagerSend.mockReset();
  });

  it("builds agent with key and cert when mtls is enabled", async () => {
    mockS3PemResponse(COMBINED_PEM);
    const agent = await buildAgent(
      createTarget({ delivery: { mtls: { enabled: true } } }),
    );

    expect(agent).toBeDefined();
    expect(agent.options.keepAlive).toBe(false);
  });

  it("builds agent without key and cert when mtls is disabled", async () => {
    const agent = await buildAgent(createTarget());

    expect(agent).toBeDefined();
    expect(mockS3Send).not.toHaveBeenCalled();
    expect(mockSecretsManagerSend).not.toHaveBeenCalled();
  });

  it("loads test CA for server trust when MTLS_TEST_CA_S3_KEY is set and mtls is disabled", async () => {
    process.env.MTLS_TEST_CA_S3_KEY = "test-ca.pem";
    jest.resetModules();
    // @ts-expect-error -- modulePaths resolves at runtime
    const mod = await import("services/delivery/tls-agent-factory");

    const caPem =
      "-----BEGIN CERTIFICATE-----\ntest-ca\n-----END CERTIFICATE-----";
    mockS3Send
      .mockResolvedValueOnce({
        Body: {
          transformToString: jest.fn().mockResolvedValue(COMBINED_PEM),
        },
      })
      .mockResolvedValueOnce({
        Body: { transformToString: jest.fn().mockResolvedValue(caPem) },
      });

    const agent = await mod.buildAgent(
      createTarget({ delivery: { mtls: { enabled: false } } }),
    );

    expect(agent).toBeDefined();
    expect(agent.options.ca).toBe(caPem);
    expect(agent.options.key).toBeUndefined();
    expect(agent.options.cert).toBeUndefined();
  });

  it("loads test CA when MTLS_TEST_CA_S3_KEY is set", async () => {
    process.env.MTLS_TEST_CA_S3_KEY = "test-ca.pem";
    jest.resetModules();
    // @ts-expect-error -- modulePaths resolves at runtime
    const mod = await import("services/delivery/tls-agent-factory");

    const caPem =
      "-----BEGIN CERTIFICATE-----\ntest-ca\n-----END CERTIFICATE-----";
    mockS3Send
      .mockResolvedValueOnce({
        Body: {
          transformToString: jest.fn().mockResolvedValue(COMBINED_PEM),
        },
      })
      .mockResolvedValueOnce({
        Body: { transformToString: jest.fn().mockResolvedValue(caPem) },
      });

    const agent = await mod.buildAgent(
      createTarget({ delivery: { mtls: { enabled: true } } }),
    );

    expect(agent).toBeDefined();
    expect(mockS3Send).toHaveBeenCalledTimes(2);
  });

  it("loads cert from S3 in non-production", async () => {
    mockS3PemResponse(COMBINED_PEM);
    await buildAgent(createTarget({ delivery: { mtls: { enabled: true } } }));

    expect(mockS3Send).toHaveBeenCalledTimes(1);
    expect(mockSecretsManagerSend).not.toHaveBeenCalled();
  });

  it("loads cert from SecretsManager in production", async () => {
    process.env.MTLS_CERT_SECRET_ARN =
      "arn:aws:secretsmanager:eu-west-2:123:secret:mtls-cert";
    jest.resetModules();
    // @ts-expect-error -- modulePaths resolves at runtime
    const mod = await import("services/delivery/tls-agent-factory");

    mockSecretsManagerSend.mockResolvedValue({
      SecretString: JSON.stringify({ key: TEST_KEY, cert: TEST_CERT }),
    });

    const agent = await mod.buildAgent(
      createTarget({ delivery: { mtls: { enabled: true } } }),
    );

    expect(agent).toBeDefined();
    expect(mockSecretsManagerSend).toHaveBeenCalledTimes(1);
    expect(mockS3Send).not.toHaveBeenCalled();
  });

  it("caches cert material on subsequent calls", async () => {
    mockS3PemResponse(COMBINED_PEM);
    const target = createTarget({ delivery: { mtls: { enabled: true } } });

    await buildAgent(target);
    await buildAgent(target);

    expect(mockS3Send).toHaveBeenCalledTimes(1);
  });

  it("exports PERMANENT_TLS_ERROR_CODES set", async () => {
    // @ts-expect-error -- modulePaths resolves at runtime
    const mod = await import("services/delivery/tls-agent-factory");

    expect(mod.PERMANENT_TLS_ERROR_CODES).toBeInstanceOf(Set);
    expect(mod.PERMANENT_TLS_ERROR_CODES.has("CERT_HAS_EXPIRED")).toBe(true);
  });

  it("resets cached material via resetCache", async () => {
    mockS3PemResponse(COMBINED_PEM);
    const target = createTarget({ delivery: { mtls: { enabled: true } } });

    await buildAgent(target);
    resetCache();
    await buildAgent(target);

    expect(mockS3Send).toHaveBeenCalledTimes(2);
  });

  it("throws when SecretsManager returns empty SecretString", async () => {
    process.env.MTLS_CERT_SECRET_ARN =
      "arn:aws:secretsmanager:eu-west-2:123:secret:mtls-cert";
    jest.resetModules();
    // @ts-expect-error -- modulePaths resolves at runtime
    const mod = await import("services/delivery/tls-agent-factory");

    mockSecretsManagerSend.mockResolvedValue({ SecretString: undefined });

    await expect(
      mod.buildAgent(createTarget({ delivery: { mtls: { enabled: true } } })),
    ).rejects.toThrow("mTLS cert secret has no value");
  });

  it("throws when S3 env vars are missing in non-production", async () => {
    delete process.env.MTLS_TEST_CERT_S3_BUCKET;
    delete process.env.MTLS_TEST_CERT_S3_KEY;
    jest.resetModules();
    // @ts-expect-error -- modulePaths resolves at runtime
    const mod = await import("services/delivery/tls-agent-factory");

    await expect(
      mod.buildAgent(createTarget({ delivery: { mtls: { enabled: true } } })),
    ).rejects.toThrow(
      "MTLS_TEST_CERT_S3_BUCKET and MTLS_TEST_CERT_S3_KEY are required",
    );
  });

  it("throws when S3 object body is empty", async () => {
    mockS3Send.mockResolvedValue({ Body: undefined });

    await expect(
      buildAgent(createTarget({ delivery: { mtls: { enabled: true } } })),
    ).rejects.toThrow("has no body");
  });

  it("builds agent with checkServerIdentity when certPinning is enabled", async () => {
    mockS3PemResponse(COMBINED_PEM);
    const target = createTarget({
      delivery: {
        mtls: {
          enabled: true,
          certPinning: { enabled: true, spkiHash: "abc123" },
        },
      },
    });

    const agent = await buildAgent(target);

    expect(agent).toBeDefined();
    expect(agent.options.checkServerIdentity).toBeDefined();
  });

  it("checkServerIdentity returns error when SPKI hash does not match", async () => {
    mockS3PemResponse(COMBINED_PEM);
    const target = createTarget({
      delivery: {
        mtls: {
          enabled: true,
          certPinning: { enabled: true, spkiHash: "expected-hash" },
        },
      },
    });

    const agent = await buildAgent(target);
    const checkFn = agent.options.checkServerIdentity as (
      hostname: string,
      cert: { raw: Buffer; subject: { CN: string } },
    ) => Error | undefined;

    const mockPeerCert = {
      raw: Buffer.from("mock-cert-der"),
      subject: { CN: "webhook.example.invalid" },
      subjectaltname: "DNS:webhook.example.invalid",
    };

    const result = checkFn("webhook.example.invalid", mockPeerCert);

    expect(result).toBeInstanceOf(Error);
    expect(result!.message).toContain("Certificate pinning failed");
    expect((result as NodeJS.ErrnoException).code).toBe(
      "ERR_CERT_PINNING_FAILED",
    );
  });

  it("checkServerIdentity returns undefined when SPKI hash matches", async () => {
    const { createHash } = jest.requireActual("node:crypto");
    const expectedHash = createHash("sha256")
      .update(Buffer.from("mock-spki-der"))
      .digest("base64");

    mockS3PemResponse(COMBINED_PEM);
    const target = createTarget({
      delivery: {
        mtls: {
          enabled: true,
          certPinning: { enabled: true, spkiHash: expectedHash },
        },
      },
    });

    const agent = await buildAgent(target);
    const checkFn = agent.options.checkServerIdentity as (
      hostname: string,
      cert: { raw: Buffer; subject: { CN: string } },
    ) => Error | undefined;

    const mockPeerCert = {
      raw: Buffer.from("mock-cert-der"),
      subject: { CN: "webhook.example.invalid" },
      subjectaltname: "DNS:webhook.example.invalid",
    };

    const result = checkFn("webhook.example.invalid", mockPeerCert);

    expect(result).toBeUndefined();
  });

  it("checkServerIdentity returns default error when hostname does not match", async () => {
    mockS3PemResponse(COMBINED_PEM);
    const target = createTarget({
      delivery: {
        mtls: {
          enabled: true,
          certPinning: { enabled: true, spkiHash: "abc" },
        },
      },
    });

    const agent = await buildAgent(target);
    const checkFn = agent.options.checkServerIdentity as (
      hostname: string,
      cert: { raw: Buffer; subject: { CN: string } },
    ) => Error | undefined;

    const mockPeerCert = {
      raw: Buffer.from("mock-cert-der"),
      subject: { CN: "other.example.invalid" },
      subjectaltname: "DNS:other.example.invalid",
    };

    const result = checkFn("webhook.example.invalid", mockPeerCert);

    expect(result).toBeDefined();
    expect(result!.message).toContain("does not match");
  });

  it("does not load cert material when mtls is disabled", async () => {
    const agent = await buildAgent(createTarget());

    expect(agent).toBeDefined();
    expect(mockS3Send).not.toHaveBeenCalled();
    expect(mockSecretsManagerSend).not.toHaveBeenCalled();
  });

  it("throws when certPinning.enabled is true but spkiHash is missing", async () => {
    const target = createTarget({
      delivery: {
        mtls: {
          enabled: true,
          certPinning: { enabled: true },
        },
      },
    });

    await expect(buildAgent(target)).rejects.toThrow(
      "certPinning.spkiHash is required when certPinning is enabled",
    );
    expect(mockS3Send).not.toHaveBeenCalled();
  });

  it("uses default CERT_EXPIRY_THRESHOLD_MS when env var is not set", async () => {
    delete process.env.CERT_EXPIRY_THRESHOLD_MS;
    jest.resetModules();
    // @ts-expect-error -- modulePaths resolves at runtime
    const mod = await import("services/delivery/tls-agent-factory");

    mockS3PemResponse(COMBINED_PEM);
    const agent = await mod.buildAgent(
      createTarget({ delivery: { mtls: { enabled: true } } }),
    );

    expect(agent).toBeDefined();
  });

  it("handles PEM with no private key or certificate sections", async () => {
    mockS3Send.mockResolvedValue({
      Body: {
        transformToString: jest.fn().mockResolvedValue("no-pem-content"),
      },
    });

    const agent = await buildAgent(
      createTarget({ delivery: { mtls: { enabled: true } } }),
    );

    expect(agent).toBeDefined();
  });
});
