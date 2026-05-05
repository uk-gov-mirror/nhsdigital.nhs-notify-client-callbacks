import {
  GetObjectCommand,
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
    try {
      const response = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: this.key }),
      );
      const body = await response.Body?.transformToString();
      if (body) {
        const map = JSON.parse(body) as Record<string, string>;
        // eslint-disable-next-line security/detect-object-injection
        return map[clientId];
      }
    } catch (error) {
      if (error instanceof Error && error.name !== "NoSuchKey") {
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
        new GetObjectCommand({ Bucket: this.bucket, Key: this.key }),
      );
      const body = await response.Body?.transformToString();
      if (body) {
        current = JSON.parse(body) as Record<string, string>;
      }
    } catch (error) {
      if (error instanceof Error && error.name !== "NoSuchKey") {
        throw error;
      }
    }

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
}
