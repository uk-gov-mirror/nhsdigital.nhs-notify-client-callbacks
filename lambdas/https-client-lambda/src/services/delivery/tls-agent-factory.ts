import { Agent } from "node:https";
import { X509Certificate, createHash } from "node:crypto";
import { checkServerIdentity } from "node:tls";
import type { PeerCertificate } from "node:tls";
import forge from "node-forge";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type { CallbackTarget } from "@nhs-notify-client-callbacks/models";
import { logger } from "@nhs-notify-client-callbacks/logger";

const { MTLS_CA_S3_KEY, MTLS_CERT_S3_BUCKET, MTLS_CERT_S3_KEY } = process.env;
const CERT_EXPIRY_THRESHOLD_MS =
  Number(process.env.CERT_EXPIRY_THRESHOLD_MS) || 86_400_000; // 24 hours

const s3Client = new S3Client({});

export const PERMANENT_TLS_ERROR_CODES = new Set([
  "CERT_HAS_EXPIRED",
  "DEPTH_ZERO_SELF_SIGNED_CERT",
  "ERR_CERT_PINNING_FAILED",
  "ERR_TLS_CERT_ALTNAME_INVALID",
  "SELF_SIGNED_CERT_IN_CHAIN",
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
]);

type CertMaterial = {
  key: string;
  cert: string;
  ca?: string;
  validTo: Date;
};

let cachedMaterial: CertMaterial | undefined;

async function loadS3Object(bucket: string, key: string): Promise<string> {
  const response = await s3Client.send(
    new GetObjectCommand({ Bucket: bucket, Key: key }),
  );

  if (!response.Body) {
    throw new Error(`S3 object s3://${bucket}/${key} has no body`);
  }

  return response.Body.transformToString();
}

async function loadFromS3(): Promise<{
  key: string;
  cert: string;
  ca?: string;
}> {
  if (!MTLS_CERT_S3_BUCKET || !MTLS_CERT_S3_KEY) {
    throw new Error("MTLS_CERT_S3_BUCKET and MTLS_CERT_S3_KEY are required");
  }

  const pem = await loadS3Object(MTLS_CERT_S3_BUCKET, MTLS_CERT_S3_KEY);

  const pemObjects = forge.pem.decode(pem);
  const keyObj = pemObjects.find((obj) => obj.type.includes("PRIVATE KEY"));
  const certObj = pemObjects.find((obj) => obj.type.includes("CERTIFICATE"));
  const key = keyObj ? forge.pem.encode(keyObj) : "";
  const cert = certObj ? forge.pem.encode(certObj) : "";

  let ca: string | undefined;
  if (MTLS_CA_S3_KEY) {
    ca = await loadS3Object(MTLS_CERT_S3_BUCKET, MTLS_CA_S3_KEY);
  }

  return { key, cert, ca };
}

async function loadCertMaterial(): Promise<CertMaterial> {
  const raw = await loadFromS3();

  const x509 = new X509Certificate(raw.cert);
  const validTo = new Date(x509.validTo);

  logger.info("mTLS certificate loaded", {
    source: "S3",
    validTo: validTo.toISOString(),
  });

  return {
    key: raw.key,
    cert: raw.cert,
    ca: raw.ca,
    validTo,
  };
}

function isExpiringSoon(material: CertMaterial): boolean {
  return material.validTo.getTime() - Date.now() < CERT_EXPIRY_THRESHOLD_MS;
}

async function getMaterial(): Promise<CertMaterial> {
  if (cachedMaterial && !isExpiringSoon(cachedMaterial)) {
    return cachedMaterial;
  }

  cachedMaterial = await loadCertMaterial();
  return cachedMaterial;
}

export async function buildAgent(target: CallbackTarget): Promise<Agent> {
  const agentOptions: Record<string, unknown> = {
    keepAlive: false,
  };

  const certPinning = target.delivery?.mtls?.certPinning;

  if (certPinning?.enabled && !certPinning.spkiHash) {
    throw new Error(
      `certPinning.spkiHash is required when certPinning is enabled for target '${target.targetId}'`,
    );
  }

  // Load CA from S3 when configured so targets with mtls.enabled: false can
  // still verify the server's cert chain.
  if (target.delivery?.mtls?.enabled || MTLS_CA_S3_KEY) {
    const material = await getMaterial();

    if (material.ca) {
      agentOptions.ca = material.ca;
    }

    if (target.delivery?.mtls?.enabled) {
      agentOptions.key = material.key;
      agentOptions.cert = material.cert;
    }
  }

  if (certPinning?.enabled) {
    const expectedHash = certPinning.spkiHash!;

    /* eslint-disable sonarjs/function-return-type -- checkServerIdentity requires Error|undefined return */
    agentOptions.checkServerIdentity = (
      hostname: string,
      peerCert: PeerCertificate,
    ) => {
      const defaultResult = checkServerIdentity(hostname, peerCert);
      if (defaultResult) {
        return defaultResult;
      }

      const rawDer = peerCert.raw;
      const x509 = new X509Certificate(rawDer);
      const spkiDer = x509.publicKey.export({
        type: "spki",
        format: "der",
      }) as Buffer;
      const actualHash = createHash("sha256").update(spkiDer).digest("base64");

      if (actualHash !== expectedHash) {
        const error = new Error(
          `Certificate pinning failed: expected SPKI hash '${expectedHash}', got '${actualHash}'`,
        );
        (error as NodeJS.ErrnoException).code = "ERR_CERT_PINNING_FAILED";
        return error;
      }

      return undefined;
    };
    /* eslint-enable sonarjs/function-return-type */
  }

  return new Agent(agentOptions as ConstructorParameters<typeof Agent>[0]);
}

export function resetCache(): void {
  cachedMaterial = undefined;
}
