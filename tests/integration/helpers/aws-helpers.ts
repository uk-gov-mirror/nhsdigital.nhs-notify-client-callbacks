import { S3Client } from "@aws-sdk/client-s3";

export type DeploymentDetails = {
  region: string;
  environment: string;
  accountId: string;
};

/**
 * Reads deployment context from environment variables
 *
 * Requires: AWS_REGION, ENVIRONMENT, AWS_ACCOUNT_ID
 */
export function getDeploymentDetails(): DeploymentDetails {
  const region = process.env.AWS_REGION ?? "eu-west-2";
  const environment = process.env.ENVIRONMENT;
  const accountId = process.env.AWS_ACCOUNT_ID;

  if (!environment) {
    throw new Error("ENVIRONMENT environment variable must be set");
  }
  if (!accountId) {
    throw new Error("AWS_ACCOUNT_ID environment variable must be set");
  }

  return { region, environment, accountId };
}

/**
 * Builds an S3 bucket name from deployment details and a bucket-specific suffix.
 */
export function buildBucketName(
  { accountId, environment, region }: DeploymentDetails,
  suffix: string,
): string {
  return `nhs-${accountId}-${region}-${environment}-${suffix}`;
}

/**
 * Creates an S3 client configured for the given region.
 */
export function createS3Client(): S3Client {
  const region = process.env.AWS_REGION ?? "eu-west-2";
  return new S3Client({ region });
}
