import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { logger } from "@nhs-notify-client-callbacks/logger";

const s3Client = new S3Client({});

const DEFAULT_CACHE_TTL_MS = 300_000; // 5 minutes

let cachedMap: Map<string, string> | undefined;
let cacheExpiresAt = 0;

async function loadMap(): Promise<Map<string, string>> {
  if (cachedMap && Date.now() < cacheExpiresAt) {
    return cachedMap;
  }

  const { APPLICATIONS_MAP_S3_BUCKET, APPLICATIONS_MAP_S3_KEY } = process.env;
  if (!APPLICATIONS_MAP_S3_BUCKET || !APPLICATIONS_MAP_S3_KEY) {
    throw new Error(
      "APPLICATIONS_MAP_S3_BUCKET and APPLICATIONS_MAP_S3_KEY are required",
    );
  }

  const response = await s3Client.send(
    new GetObjectCommand({
      Bucket: APPLICATIONS_MAP_S3_BUCKET,
      Key: APPLICATIONS_MAP_S3_KEY,
    }),
  );

  const body = await response.Body?.transformToString();
  if (!body) {
    throw new Error(
      `S3 object 's3://${APPLICATIONS_MAP_S3_BUCKET}/${APPLICATIONS_MAP_S3_KEY}' is empty`,
    );
  }

  let parsed: Record<string, string>;
  try {
    parsed = JSON.parse(body) as Record<string, string>;
  } catch {
    throw new Error(
      `S3 object 's3://${APPLICATIONS_MAP_S3_BUCKET}/${APPLICATIONS_MAP_S3_KEY}' contains invalid JSON`,
    );
  }

  cachedMap = new Map(Object.entries(parsed));
  const ttlMs =
    Number(process.env.APPLICATIONS_MAP_CACHE_TTL_MS) || DEFAULT_CACHE_TTL_MS;
  cacheExpiresAt = Date.now() + ttlMs;
  logger.info("Applications map loaded from S3", {
    bucket: APPLICATIONS_MAP_S3_BUCKET,
    key: APPLICATIONS_MAP_S3_KEY,
  });
  return cachedMap;
}

export async function getApplicationId(clientId: string): Promise<string> {
  const map = await loadMap();
  const applicationId = map.get(clientId);

  if (!applicationId) {
    throw new Error(
      `No applicationId found for clientId '${clientId}' in applications map`,
    );
  }

  return applicationId;
}

export function resetCache(): void {
  cachedMap = undefined;
  cacheExpiresAt = 0;
}
