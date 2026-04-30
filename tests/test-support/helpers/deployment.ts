export type DeploymentDetails = {
  region: string;
  environment: string;
  project: string;
  component: string;
  clientComponent: string;
  accountId: string;
};

export function getDeploymentDetails(): DeploymentDetails {
  const region = process.env.AWS_REGION ?? "eu-west-2";
  const environment = process.env.ENVIRONMENT;
  const project = process.env.PROJECT ?? "nhs";
  const component = process.env.COMPONENT ?? "cb";
  const clientComponent = process.env.CLIENT_COMPONENT ?? "cbc";
  const accountId = process.env.AWS_ACCOUNT_ID;

  if (!environment) {
    throw new Error("ENVIRONMENT environment variable must be set");
  }

  if (!accountId) {
    throw new Error("AWS_ACCOUNT_ID environment variable must be set");
  }

  return {
    region,
    environment,
    project,
    component,
    clientComponent,
    accountId,
  };
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

export function buildLambdaLogGroupName(
  { component, environment, project }: DeploymentDetails,
  functionIdentifier: string,
): string {
  return `/aws/lambda/${project}-${environment}-${component}-${functionIdentifier}`;
}
