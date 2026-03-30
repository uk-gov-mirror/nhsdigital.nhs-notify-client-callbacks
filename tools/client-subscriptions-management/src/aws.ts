import { S3Client } from "@aws-sdk/client-s3";
import { SSMClient } from "@aws-sdk/client-ssm";
import { GetCallerIdentityCommand, STSClient } from "@aws-sdk/client-sts";
import { fromIni } from "@aws-sdk/credential-providers";
import { ClientSubscriptionRepository } from "src/repository/client-subscriptions";
import SsmApplicationsMapRepository from "src/repository/ssm-applications-map";
import { S3Repository } from "src/repository/s3";

export const resolveProfile = (
  profileArg?: string,
  env: NodeJS.ProcessEnv = process.env,
): string | undefined => profileArg ?? env.AWS_PROFILE;

export const resolveAccountId = async (
  profile?: string,
  region?: string,
): Promise<string> => {
  const credentials = profile ? fromIni({ profile }) : undefined;
  const client = new STSClient({ region, credentials });
  const { Account } = await client.send(new GetCallerIdentityCommand({}));
  if (!Account) {
    throw new Error("Unable to determine AWS account ID from STS");
  }
  return Account;
};

export const deriveBucketName = (
  accountId: string,
  environment: string,
  region: string,
): string =>
  `nhs-${accountId}-${region}-${environment}-callbacks-subscription-config`;

export const resolveRegion = (
  regionArg?: string,
  env: NodeJS.ProcessEnv = process.env,
): string | undefined => regionArg ?? env.AWS_REGION ?? env.AWS_DEFAULT_REGION;

export const resolveBucketName = async (args: {
  bucketName?: string;
  environment?: string;
  profile?: string;
  region?: string;
}): Promise<string> => {
  const { bucketName, environment, profile, region } = args;

  if (bucketName) {
    return bucketName;
  }

  const resolvedEnvironment = environment ?? process.env.ENVIRONMENT;
  const resolvedRegion = resolveRegion(region) ?? "eu-west-2";
  const resolvedAccountId =
    process.env.AWS_ACCOUNT_ID ??
    (await resolveAccountId(profile, resolvedRegion));

  if (!resolvedEnvironment) {
    throw new Error(
      "Environment is required to derive bucket name. Please provide via --environment or ENVIRONMENT env var.",
    );
  }

  return deriveBucketName(
    resolvedAccountId,
    resolvedEnvironment,
    resolvedRegion,
  );
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

export const createRepository = (options: {
  bucketName: string;
  region?: string;
  profile?: string;
}): ClientSubscriptionRepository => {
  const s3Repository = new S3Repository(
    options.bucketName,
    createS3Client(options.region, options.profile),
  );
  return new ClientSubscriptionRepository(s3Repository);
};

export const createSsmClient = (
  region?: string,
  profile?: string,
  env: NodeJS.ProcessEnv = process.env,
): SSMClient => {
  const endpoint = env.AWS_ENDPOINT_URL;
  const credentials = profile ? fromIni({ profile }) : undefined;
  return new SSMClient({ region, endpoint, credentials });
};

export const deriveParameterName = (environment: string): string =>
  `/nhs/${environment}/callbacks/applications-map`;

export const resolveParameterName = (args: {
  parameterName?: string;
  environment?: string;
  env?: NodeJS.ProcessEnv;
}): string => {
  const { env = process.env, environment, parameterName } = args;

  if (parameterName) {
    return parameterName;
  }

  const resolvedEnvironment = environment ?? env.ENVIRONMENT;
  if (!resolvedEnvironment) {
    throw new Error(
      "Environment is required to derive parameter name. Please provide via --environment or ENVIRONMENT env var.",
    );
  }

  return deriveParameterName(resolvedEnvironment);
};

export const createSsmApplicationsMapRepository = (options: {
  parameterName: string;
  region?: string;
  profile?: string;
}): SsmApplicationsMapRepository =>
  new SsmApplicationsMapRepository(
    createSsmClient(options.region, options.profile),
    options.parameterName,
  );

export { default as SsmApplicationsMapRepository } from "src/repository/ssm-applications-map";
