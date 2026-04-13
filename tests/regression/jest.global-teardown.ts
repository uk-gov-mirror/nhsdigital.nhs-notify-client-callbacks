import { DeleteObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { SQSClient } from "@aws-sdk/client-sqs";
import {
  buildSubscriptionConfigBucketName,
  getDeploymentDetails,
} from "@nhs-notify-client-callbacks/test-support/helpers";

import { getRegressionClientConfig } from "./helpers/mock-client-config";
import { buildMockClientDlqQueueUrl, purgeQueues } from "./helpers/sqs";

export default async function globalTeardown(): Promise<void> {
  const deploymentDetails = getDeploymentDetails();
  const clientConfig = getRegressionClientConfig();
  const bucketName = buildSubscriptionConfigBucketName(deploymentDetails);

  const sqsClient = new SQSClient({ region: deploymentDetails.region });
  const s3Client = new S3Client({ region: deploymentDetails.region });

  try {
    const dlqQueueUrl = buildMockClientDlqQueueUrl(
      deploymentDetails,
      clientConfig.targets,
    );
    await purgeQueues(sqsClient, [dlqQueueUrl]);

    await s3Client
      .send(
        new DeleteObjectCommand({
          Bucket: bucketName,
          Key: "unmapped-client.json",
        }),
      )
      .catch(() => undefined);
  } finally {
    sqsClient.destroy();
    s3Client.destroy();
  }
}
