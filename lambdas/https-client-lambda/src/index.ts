import type { SQSBatchResponse, SQSEvent } from "aws-lambda";
import { processRecords } from "handler";

export async function handler(event: SQSEvent): Promise<SQSBatchResponse> {
  const batchItemFailures = await processRecords(event.Records);
  return { batchItemFailures };
}
