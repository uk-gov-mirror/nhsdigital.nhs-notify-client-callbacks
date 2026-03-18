import { S3Client } from "@aws-sdk/client-s3";
import { SQSClient } from "@aws-sdk/client-sqs";

import type { DeploymentDetails } from "./deployment";

export function createS3Client({ region }: DeploymentDetails): S3Client {
  return new S3Client({ region });
}

export function createSqsClient({ region }: DeploymentDetails): SQSClient {
  return new SQSClient({ region });
}
