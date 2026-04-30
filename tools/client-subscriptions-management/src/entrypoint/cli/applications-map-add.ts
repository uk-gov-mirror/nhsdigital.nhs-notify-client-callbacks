import type { Argv } from "yargs";
import {
  type ApplicationsMapCliArgs,
  type CliCommand,
  type ClientCliArgs,
  type WriteCliArgs,
  applicationsMapOptions,
  clientIdOption,
  commonOptions,
  createS3ApplicationsMapRepository,
  runCommand,
  writeOptions,
} from "src/entrypoint/cli/helper";
import { formatApplicationsMap } from "src/format";

type ApplicationsMapAddArgs = ClientCliArgs &
  ApplicationsMapCliArgs &
  WriteCliArgs & {
    "application-id": string;
  };

export const builder = (yargs: Argv) =>
  yargs.options({
    ...commonOptions,
    ...clientIdOption,
    ...applicationsMapOptions,
    ...writeOptions,
    "application-id": {
      type: "string",
      demandOption: true,
      description: "Application ID to associate with the client",
    },
  });

export const handler: CliCommand<ApplicationsMapAddArgs>["handler"] = async (
  argv,
) => {
  const repository = await createS3ApplicationsMapRepository(argv);
  const result = await repository.addApplication(
    argv["client-id"],
    argv["application-id"],
    argv["dry-run"],
  );
  console.log(`Applications map updated for client '${argv["client-id"]}'.`);
  if (argv["dry-run"]) {
    console.log("Dry run — no changes written to S3.");
  }
  console.log(formatApplicationsMap(result));
};

export const command: CliCommand<ApplicationsMapAddArgs> = {
  command: "applications-map-add",
  describe: "Add or update a client-to-application-ID mapping in S3",
  builder,
  handler,
};

export async function main(args: string[] = process.argv) {
  await runCommand(command, args);
}
