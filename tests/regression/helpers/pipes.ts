import { DescribePipeCommand, PipesClient } from "@aws-sdk/client-pipes";

export type PipeDescription = {
  name: string | undefined;
  currentState: string | undefined;
  desiredState: string | undefined;
  sourceArn: string | undefined;
  targetArn: string | undefined;
  enrichmentArn: string | undefined;
};

export async function describePipe(
  client: PipesClient,
  pipeName: string,
): Promise<PipeDescription> {
  const response = await client.send(
    new DescribePipeCommand({ Name: pipeName }),
  );
  return {
    name: response.Name,
    currentState: response.CurrentState,
    desiredState: response.DesiredState,
    sourceArn: response.Source,
    targetArn: response.Target,
    enrichmentArn: response.Enrichment,
  };
}
