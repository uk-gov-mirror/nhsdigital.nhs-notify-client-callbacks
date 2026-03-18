import { HeadBucketCommand } from "@aws-sdk/client-s3";
import type { S3Client } from "@aws-sdk/client-s3";
import {
  buildSubscriptionConfigBucketName,
  createS3Client,
  getDeploymentDetails,
} from "helpers";

describe("Infrastructure exists", () => {
  let s3Client: S3Client;
  let bucketName: string;

  beforeAll(async () => {
    const deploymentDetails = getDeploymentDetails();
    bucketName = buildSubscriptionConfigBucketName(deploymentDetails);
    s3Client = createS3Client(deploymentDetails);
  });

  afterAll(() => {
    s3Client?.destroy();
  });

  it("should confirm the subscription config S3 bucket exists", async () => {
    const response = await s3Client.send(
      new HeadBucketCommand({ Bucket: bucketName }),
    );

    expect(response.$metadata.httpStatusCode).toBe(200);
  });
});
