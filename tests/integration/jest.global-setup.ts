import { PutObjectCommand } from "@aws-sdk/client-s3";
import {
  buildSubscriptionConfigBucketName,
  createS3Client,
  getDeploymentDetails,
} from "./helpers";

const mockClientSubscriptionKey = "client_subscriptions/mock-client.json";

const mockClientSubscriptionBody = JSON.stringify({
  clientId: "mock-client",
  subscriptions: [
    {
      subscriptionId: "mock-client-message",
      subscriptionType: "MessageStatus",
      messageStatuses: ["DELIVERED"],
      targetIds: ["445527ff-277b-43a4-a4b0-15eedbd71597"],
    },
    {
      subscriptionId: "mock-client-channel",
      subscriptionType: "ChannelStatus",
      channelStatuses: ["DELIVERED"],
      channelType: "NHSAPP",
      supplierStatuses: ["delivered"],
      targetIds: ["445527ff-277b-43a4-a4b0-15eedbd71597"],
    },
  ],
  targets: [
    {
      type: "API",
      targetId: "445527ff-277b-43a4-a4b0-15eedbd71597",
      invocationEndpoint: "https://some-mock-client.endpoint/webhook",
      invocationMethod: "POST",
      invocationRateLimit: 10,
      apiKey: {
        headerName: "x-api-key",
        headerValue: "some-api-key",
      },
    },
  ],
});

export default async function globalSetup() {
  const deploymentDetails = getDeploymentDetails();
  const bucketName = buildSubscriptionConfigBucketName(deploymentDetails);
  const client = createS3Client(deploymentDetails);

  try {
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
