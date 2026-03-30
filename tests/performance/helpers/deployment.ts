import {
  type DeploymentDetails,
  buildLambdaLogGroupName,
} from "@nhs-notify-client-callbacks/test-support/helpers/deployment";

export function buildTransformFilterLambdaLogGroupName(
  details: DeploymentDetails,
): string {
  return buildLambdaLogGroupName(details, "client-transform-filter");
}
