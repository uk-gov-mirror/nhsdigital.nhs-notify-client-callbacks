import { S3Client } from "@aws-sdk/client-s3";
import { fromIni } from "@aws-sdk/credential-providers";
import { ClientSubscriptionRepository } from "src/repository/client-subscriptions";
import { S3Repository } from "src/repository/s3";
import { clientSubscriptionBuilder } from "src/domain/client-subscription-builder";

type RepositoryOptions = {
  bucketName: string;
  region?: string;
  profile?: string;
};

export const createS3Client = (
  region?: string,
  profile?: string,
  env: NodeJS.ProcessEnv = process.env,
): S3Client => {
  const endpoint = env.AWS_ENDPOINT_URL;
  const forcePathStyle = endpoint?.includes("localhost") ? true : undefined;
  const credentials = profile ? fromIni({ profile }) : undefined;
  return new S3Client({ region, endpoint, forcePathStyle, credentials });
};

export const createClientSubscriptionRepository = (
  options: RepositoryOptions,
): ClientSubscriptionRepository => {
  const s3Repository = new S3Repository(
    options.bucketName,
    createS3Client(options.region, options.profile),
  );
  return new ClientSubscriptionRepository(
    s3Repository,
    clientSubscriptionBuilder,
  );
};
