import { GetParameterCommand, SSMClient } from "@aws-sdk/client-ssm";

export default async function getParameter(
  client: SSMClient,
  name: string,
): Promise<string | undefined> {
  const response = await client.send(new GetParameterCommand({ Name: name }));
  return response.Parameter?.Value;
}
