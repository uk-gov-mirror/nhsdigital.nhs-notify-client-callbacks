import { GetParameterCommand, SSMClient } from "@aws-sdk/client-ssm";
import { logger } from "services/logger";

const ssmClient = new SSMClient({});

let cachedMap: Map<string, string> | undefined;

async function loadMap(): Promise<Map<string, string>> {
  if (cachedMap) {
    return cachedMap;
  }

  const { APPLICATIONS_MAP_PARAMETER } = process.env;
  if (!APPLICATIONS_MAP_PARAMETER) {
    throw new Error("APPLICATIONS_MAP_PARAMETER is required");
  }

  const response = await ssmClient.send(
    new GetParameterCommand({
      Name: APPLICATIONS_MAP_PARAMETER,
      WithDecryption: true,
    }),
  );

  if (!response.Parameter?.Value) {
    throw new Error(
      `SSM parameter '${APPLICATIONS_MAP_PARAMETER}' not found or has no value`,
    );
  }

  let parsed: Record<string, string>;
  try {
    parsed = JSON.parse(response.Parameter.Value) as Record<string, string>;
  } catch {
    throw new Error(
      `SSM parameter '${APPLICATIONS_MAP_PARAMETER}' contains invalid JSON`,
    );
  }

  cachedMap = new Map(Object.entries(parsed));
  logger.info("Applications map loaded from SSM", {
    parameterName: APPLICATIONS_MAP_PARAMETER,
  });
  return cachedMap;
}

export async function getApplicationId(clientId: string): Promise<string> {
  const map = await loadMap();
  const applicationId = map.get(clientId);

  if (!applicationId) {
    throw new Error(
      `No applicationId found for clientId '${clientId}' in SSM map`,
    );
  }

  return applicationId;
}

export function resetCache(): void {
  cachedMap = undefined;
}
