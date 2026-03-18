import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import {
  buildSubscriptionConfigBucketName,
  createS3Client,
  getDeploymentDetails,
} from "./helpers";

const mockClientSubscriptionKey = "client_subscriptions/mock-client.json";

export default async function globalTeardown() {
  const deploymentDetails = getDeploymentDetails();
  const bucketName = buildSubscriptionConfigBucketName(deploymentDetails);
  const client = createS3Client(deploymentDetails);

  try {
    await client.send(
      new DeleteObjectCommand({
        Bucket: bucketName,
        Key: mockClientSubscriptionKey,
      }),
    );
  } finally {
    client.destroy();
  }
}
