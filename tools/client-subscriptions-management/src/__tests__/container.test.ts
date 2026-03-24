import { S3Client } from "@aws-sdk/client-s3";

const mockS3Repository = jest.fn();
const mockRepository = jest.fn();

jest.mock("src/repository/s3", () => ({
  S3Repository: mockS3Repository,
}));

jest.mock("src/repository/client-subscriptions", () => ({
  ClientSubscriptionRepository: mockRepository,
}));

import { createRepository } from "src/aws";

describe("createRepository", () => {
  it("creates repository with provided options", () => {
    const repoInstance = { repo: true };
    mockRepository.mockReturnValue(repoInstance);

    const result = createRepository({
      bucketName: "bucket-1",
      region: "eu-west-2",
    });

    expect(mockS3Repository).toHaveBeenCalledWith(
      "bucket-1",
      expect.any(S3Client),
    );
    expect(mockRepository).toHaveBeenCalledWith(
      mockS3Repository.mock.instances[0],
    );
    expect(result).toBe(repoInstance);
  });
});
