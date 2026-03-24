import {
  GetObjectCommand,
  ListObjectsV2Command,
  NoSuchKey,
  PutObjectCommand,
  PutObjectCommandInput,
  S3Client,
} from "@aws-sdk/client-s3";

// eslint-disable-next-line import-x/prefer-default-export
export class S3Repository {
  constructor(
    private readonly bucketName: string,
    private readonly s3Client: S3Client,
  ) {}

  async getObject(key: string): Promise<string | undefined> {
    const params = {
      Bucket: this.bucketName,
      Key: key,
    };
    try {
      const { Body } = await this.s3Client.send(new GetObjectCommand(params));

      if (!Body) {
        throw new Error("Response body is missing");
      }

      return await Body.transformToString();
    } catch (error) {
      if (error instanceof NoSuchKey) {
        return undefined;
      }
      throw error;
    }
  }

  async putRawData(
    fileData: PutObjectCommandInput["Body"],
    key: string,
  ): Promise<void> {
    const params = {
      Bucket: this.bucketName,
      Key: key,
      Body: fileData,
    };

    await this.s3Client.send(new PutObjectCommand(params));
  }

  async listObjectKeys(prefix: string): Promise<string[]> {
    const keys: string[] = [];
    let continuationToken: string | undefined;

    do {
      const { Contents, NextContinuationToken } = await this.s3Client.send(
        new ListObjectsV2Command({
          Bucket: this.bucketName,
          Prefix: prefix,
          ContinuationToken: continuationToken,
        }),
      );
      for (const obj of Contents ?? []) {
        if (obj.Key) {
          keys.push(obj.Key);
        }
      }
      continuationToken = NextContinuationToken;
    } while (continuationToken);

    return keys;
  }
}
