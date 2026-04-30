import {
  GetObjectCommand,
  NoSuchKey,
  PutObjectCommand,
  type S3Client,
} from "@aws-sdk/client-s3";

export default class S3ApplicationsMapRepository {
  constructor(
    private readonly client: S3Client,
    private readonly bucket: string,
    private readonly key: string,
  ) {}

  async getApplication(clientId: string): Promise<string | undefined> {
    const map = await this.loadMap();
    if (!map) return undefined;
    // eslint-disable-next-line security/detect-object-injection
    return map[clientId];
  }

  async addApplication(
    clientId: string,
    applicationId: string,
    dryRun = false,
  ): Promise<Map<string, string>> {
    const current = (await this.loadMap()) ?? {};
    const updated = { ...current, [clientId]: applicationId };

    if (!dryRun) {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: this.key,
          Body: JSON.stringify(updated),
          ContentType: "application/json",
        }),
      );
    }

    return new Map(Object.entries(updated));
  }

  private async loadMap(): Promise<Record<string, string> | undefined> {
    try {
      const response = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: this.key }),
      );
      const body = await response.Body?.transformToString();
      if (!body) return undefined;
      return JSON.parse(body) as Record<string, string>;
    } catch (error) {
      if (error instanceof NoSuchKey) {
        return undefined;
      }
      throw error;
    }
  }
}
