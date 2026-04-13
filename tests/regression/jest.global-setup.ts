import {
  HeadBucketCommand,
  HeadObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { GetParameterCommand, SSMClient } from "@aws-sdk/client-ssm";
import {
  buildSubscriptionConfigBucketName,
  getDeploymentDetails,
} from "@nhs-notify-client-callbacks/test-support/helpers";

import { getRegressionClientConfig } from "./helpers/mock-client-config";

export default async function globalSetup(): Promise<void> {
  const deploymentDetails = getDeploymentDetails();
  const bucketName = buildSubscriptionConfigBucketName(deploymentDetails);
  const clientConfig = getRegressionClientConfig();

  const s3Client = new S3Client({ region: deploymentDetails.region });
  const ssmClient = new SSMClient({ region: deploymentDetails.region });

  try {
    await s3Client.send(new HeadBucketCommand({ Bucket: bucketName }));

    await s3Client.send(
      new HeadObjectCommand({
        Bucket: bucketName,
        Key: `${clientConfig.clientId}.json`,
      }),
    );

    const ssmParameterName = `/${deploymentDetails.project}/${deploymentDetails.environment}/${deploymentDetails.component}/applications-map`;
    const ssmResponse = await ssmClient.send(
      new GetParameterCommand({ Name: ssmParameterName }),
    );

    if (!ssmResponse.Parameter?.Value) {
      throw new Error(
        `SSM parameter ${ssmParameterName} exists but has no value`,
      );
    }

    const applicationsMap = JSON.parse(ssmResponse.Parameter.Value) as Record<
      string,
      string
    >;
    if (!applicationsMap[clientConfig.clientId]) {
      throw new Error(
        `SSM Applications Map does not contain entry for client '${clientConfig.clientId}'`,
      );
    }
  } finally {
    s3Client.destroy();
    ssmClient.destroy();
  }
}
