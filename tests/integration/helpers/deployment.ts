export type DeploymentDetails = {
  region: string;
  environment: string;
  project: string;
  component: string;
  accountId: string;
};

export function getDeploymentDetails(): DeploymentDetails {
  const region = process.env.AWS_REGION ?? "eu-west-2";
  const environment = process.env.ENVIRONMENT;
  const project = process.env.PROJECT;
  const component = process.env.COMPONENT;
  const accountId = process.env.AWS_ACCOUNT_ID;

  if (!environment) {
    throw new Error("ENVIRONMENT environment variable must be set");
  }
  if (!project) {
    throw new Error("PROJECT environment variable must be set");
  }
  if (!component) {
    throw new Error("COMPONENT environment variable must be set");
  }
  if (!accountId) {
    throw new Error("AWS_ACCOUNT_ID environment variable must be set");
  }

  return { region, environment, project, component, accountId };
}

export function buildSubscriptionConfigBucketName({
  accountId,
  component,
  environment,
  project,
  region,
}: DeploymentDetails): string {
  return `${project}-${accountId}-${region}-${environment}-${component}-subscription-config`;
}

export function buildDebugLogBucketName({
  accountId,
  component,
  environment,
  project,
  region,
}: DeploymentDetails): string {
  return `${project}-${accountId}-${region}-${environment}-${component}-debug-log`;
}
