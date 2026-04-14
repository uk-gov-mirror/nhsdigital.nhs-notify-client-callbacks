import { X509Certificate, createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import type { Argv } from "yargs";
import {
  type CliCommand,
  type ClientCliArgs,
  type WriteCliArgs,
  clientIdOption,
  commonOptions,
  createRepository,
  runCommand,
  writeOptions,
} from "src/entrypoint/cli/helper";
import { formatClientConfig } from "src/format";

type TargetsSetCertificateArgs = ClientCliArgs &
  WriteCliArgs & {
    "target-id": string;
    "pem-file": string;
  };

export const builder = (yargs: Argv) =>
  yargs.options({
    ...commonOptions,
    ...clientIdOption,
    ...writeOptions,
    "target-id": {
      type: "string",
      demandOption: true,
      description: "Target identifier to update",
    },
    "pem-file": {
      type: "string",
      demandOption: true,
      description: "Path to PEM certificate file",
    },
  });

function extractSpkiHash(pemPath: string): string {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- path is provided directly by the operator via CLI arg
  const pemBuffer = readFileSync(pemPath);
  const x509 = new X509Certificate(pemBuffer);
  const spkiDer = x509.publicKey.export({
    type: "spki",
    format: "der",
  }) as Buffer;
  return createHash("sha256").update(spkiDer).digest("base64");
}

export const handler: CliCommand<TargetsSetCertificateArgs>["handler"] = async (
  argv,
) => {
  const spkiHash = extractSpkiHash(argv["pem-file"]);
  console.log(`Extracted SPKI hash: ${spkiHash}`);

  const repository = await createRepository(argv);
  const config = await repository.getClientConfig(argv["client-id"]);

  if (!config) {
    throw new Error(`No configuration found for client: ${argv["client-id"]}`);
  }

  const target = config.targets.find((t) => t.targetId === argv["target-id"]);

  if (!target) {
    throw new Error(
      `Target '${argv["target-id"]}' not found for client '${argv["client-id"]}'`,
    );
  }

  target.certPinning = {
    ...target.certPinning,
    spkiHash,
  };

  const result = await repository.putClientConfig(
    argv["client-id"],
    config,
    argv["dry-run"],
  );
  console.log("Certificate SPKI hash stored successfully");
  console.log(formatClientConfig(result));
};

export const command: CliCommand<TargetsSetCertificateArgs> = {
  command: "targets-set-certificate",
  describe: "Extract and store SPKI hash from a PEM certificate for a target",
  builder,
  handler,
};

export async function main(args: string[] = process.argv) {
  await runCommand(command, args);
}
