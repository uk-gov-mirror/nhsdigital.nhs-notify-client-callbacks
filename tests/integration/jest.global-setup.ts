import { PutObjectCommand } from "@aws-sdk/client-s3";
import {
  buildDebugLogBucketName,
  buildSubscriptionConfigBucketName,
  createS3Client,
  deleteDebugLogEntries,
  getDeploymentDetails,
} from "./helpers";

const mockClientSubscriptionKey = "client_subscriptions/mock-client.json";

const mockClientSubscriptionBody = JSON.stringify([
  {
    SubscriptionId: "mock-client",
    SubscriptionType: "MessageStatus",
    ClientId: "mock-client",
    MessageStatuses: ["DELIVERED"],
    Targets: [
      {
        Type: "API",
        TargetId: "445527ff-277b-43a4-a4b0-15eedbd71597",
        InvocationEndpoint: "https://some-mock-client.endpoint/webhook",
        InvocationMethod: "POST",
        InvocationRateLimit: 10,
        APIKey: {
          HeaderName: "x-api-key",
          HeaderValue: "some-api-key",
        },
      },
    ],
  },
  {
    SubscriptionId: "mock-client-channel",
    SubscriptionType: "ChannelStatus",
    ClientId: "mock-client",
    ChannelStatuses: ["DELIVERED"],
    ChannelType: "NHSAPP",
    SupplierStatuses: ["delivered"],
    Targets: [
      {
        Type: "API",
        TargetId: "445527ff-277b-43a4-a4b0-15eedbd71597",
        InvocationEndpoint: "https://some-mock-client.endpoint/webhook",
        InvocationMethod: "POST",
        InvocationRateLimit: 10,
        APIKey: {
          HeaderName: "x-api-key",
          HeaderValue: "some-api-key",
        },
      },
    ],
  },
]);

export default async function globalSetup() {
  const deploymentDetails = getDeploymentDetails();
  const bucketName = buildSubscriptionConfigBucketName(deploymentDetails);
  const debugLogBucketName = buildDebugLogBucketName(deploymentDetails);
  const client = createS3Client(deploymentDetails);

  try {
    await deleteDebugLogEntries(client, debugLogBucketName);

    await client.send(
      new PutObjectCommand({
        Bucket: bucketName,
        Key: mockClientSubscriptionKey,
        ContentType: "application/json",
        Body: mockClientSubscriptionBody,
      }),
    );
  } finally {
    client.destroy();
  }
}
