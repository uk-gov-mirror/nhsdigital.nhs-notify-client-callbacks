import https from "node:https";
import type { Agent } from "node:https";
import type { CallbackTarget } from "@nhs-notify-client-callbacks/models";
import { PERMANENT_TLS_ERROR_CODES } from "services/delivery/tls-agent-factory";

export type DeliveryResult =
  | { ok: true }
  | { ok: false; permanent: true }
  | {
      ok: false;
      permanent: false;
      statusCode: 429;
      retryAfterHeader: string | undefined;
    }
  | { ok: false; permanent: false; statusCode: number };

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
        res.resume();

        const statusCode = res.statusCode ?? 0;

        if (statusCode >= 200 && statusCode < 300) {
          resolve({ ok: true });
          return;
        }

        if (statusCode === 429) {
          const retryAfterHeader = res.headers["retry-after"];
          resolve({
            ok: false,
            permanent: false,
            statusCode: 429,
            retryAfterHeader,
          });
          return;
        }

        if (statusCode >= 400 && statusCode < 500) {
          resolve({ ok: false, permanent: true });
          return;
        }

        resolve({ ok: false, permanent: false, statusCode });
      },
    );

    req.on("timeout", () => {
      req.destroy(new Error("Request timed out"));
    });

    req.on("error", (error: NodeJS.ErrnoException) => {
      if (error.code && PERMANENT_TLS_ERROR_CODES.has(error.code)) {
        resolve({ ok: false, permanent: true });
        return;
      }

      resolve({ ok: false, permanent: false, statusCode: 0 });
    });

    req.end(signedPayloadJson);
  });
}
