import {
  GetParameterCommand,
  PutParameterCommand,
  type SSMClient,
} from "@aws-sdk/client-ssm";

export default class SsmApplicationsMapRepository {
  constructor(
    private readonly client: SSMClient,
    private readonly parameterName: string,
  ) {}

  async getApplication(clientId: string): Promise<string | undefined> {
    try {
      const response = await this.client.send(
        new GetParameterCommand({
          Name: this.parameterName,
          WithDecryption: true,
        }),
      );
      if (response.Parameter?.Value) {
        const map = JSON.parse(response.Parameter.Value) as Record<
          string,
          string
        >;
        return map[clientId];
      }
    } catch (error) {
      if (error instanceof Error && error.name !== "ParameterNotFound") {
        throw error;
      }
    }
    return undefined;
  }

  async addApplication(
    clientId: string,
    applicationId: string,
    dryRun = false,
  ): Promise<Map<string, string>> {
    let current: Record<string, string> = {};

    try {
      const response = await this.client.send(
        new GetParameterCommand({
          Name: this.parameterName,
          WithDecryption: true,
        }),
      );
      if (response.Parameter?.Value) {
        current = JSON.parse(response.Parameter.Value) as Record<
          string,
          string
        >;
      }
    } catch (error) {
      if (error instanceof Error && error.name !== "ParameterNotFound") {
        throw error;
      }
    }

    const updated = { ...current, [clientId]: applicationId };

    if (!dryRun) {
      await this.client.send(
        new PutParameterCommand({
          Name: this.parameterName,
          Value: JSON.stringify(updated),
          Type: "SecureString",
          Overwrite: true,
        }),
      );
    }

    return new Map(Object.entries(updated));
  }
}
