import https from "node:https";
import type { Agent } from "node:https";
import type { CallbackTarget } from "@nhs-notify-client-callbacks/models";
import { PERMANENT_TLS_ERROR_CODES } from "services/delivery/tls-agent-factory";

export const OUTCOME_SUCCESS = "success" as const;
export const OUTCOME_PERMANENT_FAILURE = "permanent_failure" as const;
export const OUTCOME_RATE_LIMITED = "rate_limited" as const;
export const OUTCOME_TRANSIENT_FAILURE = "transient_failure" as const;

export type DeliveryResult =
  | { outcome: typeof OUTCOME_SUCCESS }
  | {
      outcome: typeof OUTCOME_PERMANENT_FAILURE;
      statusCode?: number;
      errorCode?: string;
      responseBody?: string;
    }
  | {
      outcome: typeof OUTCOME_RATE_LIMITED;
      statusCode: 429;
      retryAfterHeader: string | undefined;
    }
  | { outcome: typeof OUTCOME_TRANSIENT_FAILURE; statusCode: number };

export function deliverPayload(
  target: CallbackTarget,
  signedPayloadJson: string,
  signatureHeader: string,
  agent: Agent,
): Promise<DeliveryResult> {
  const requestTimeoutMs = Number(process.env.REQUEST_TIMEOUT_MS ?? "30000");

  return new Promise((resolve) => {
    const url = new URL(target.invocationEndpoint);

    const req = https.request(
      url,
      {
        method: target.invocationMethod,
        agent,
        timeout: requestTimeoutMs,
        headers: {
          "Content-Type": "application/json",
          "x-hmac-sha256-signature": signatureHeader,
          [target.apiKey.headerName]: target.apiKey.headerValue,
        },
      },
      (res) => {
        const statusCode = res.statusCode ?? 0;

        if (statusCode >= 200 && statusCode < 300) {
          res.resume();
          resolve({ outcome: OUTCOME_SUCCESS });
          return;
        }

        if (statusCode === 429) {
          res.resume();
          const retryAfterHeader = res.headers["retry-after"];
          resolve({
            outcome: OUTCOME_RATE_LIMITED,
            statusCode,
            retryAfterHeader,
          });
          return;
        }

        if (statusCode >= 400 && statusCode < 500) {
          const chunks: Buffer[] = [];
          res.on("data", (chunk: Buffer) => chunks.push(chunk));
          res.on("end", () => {
            const responseBody = Buffer.concat(chunks).toString("utf8");
            resolve({
              outcome: OUTCOME_PERMANENT_FAILURE,
              statusCode,
              responseBody,
            });
          });
          return;
        }

        res.resume();
        resolve({ outcome: OUTCOME_TRANSIENT_FAILURE, statusCode });
      },
    );

    req.on("timeout", () => {
      req.destroy(new Error("Request timed out"));
    });

    req.on("error", (error: NodeJS.ErrnoException) => {
      if (error.code && PERMANENT_TLS_ERROR_CODES.has(error.code)) {
        resolve({ outcome: OUTCOME_PERMANENT_FAILURE, errorCode: error.code });
        return;
      }

      resolve({ outcome: OUTCOME_TRANSIENT_FAILURE, statusCode: 0 });
    });

    req.end(signedPayloadJson);
  });
}
