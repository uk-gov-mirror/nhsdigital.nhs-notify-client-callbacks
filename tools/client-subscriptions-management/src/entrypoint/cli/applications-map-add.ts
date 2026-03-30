import type { Argv } from "yargs";
import {
  type CliCommand,
  type ClientCliArgs,
  type SsmCliArgs,
  type WriteCliArgs,
  clientIdOption,
  commonOptions,
  createSsmApplicationsMapRepository,
  parameterNameOption,
  runCommand,
  writeOptions,
} from "src/entrypoint/cli/helper";
import { formatApplicationsMap } from "src/format";

type ApplicationsMapAddArgs = ClientCliArgs &
  SsmCliArgs &
  WriteCliArgs & {
    "application-id": string;
  };

export const builder = (yargs: Argv) =>
  yargs.options({
    ...commonOptions,
    ...clientIdOption,
    ...parameterNameOption,
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
  const repository = createSsmApplicationsMapRepository(argv);
  const result = await repository.addApplication(
    argv["client-id"],
    argv["application-id"],
    argv["dry-run"],
  );
  console.log(`Applications map updated for client '${argv["client-id"]}'.`);
  if (argv["dry-run"]) {
    console.log("Dry run — no changes written to SSM.");
  }
  console.log(formatApplicationsMap(result));
};

export const command: CliCommand<ApplicationsMapAddArgs> = {
  command: "applications-map-add",
  describe: "Add or update a client-to-application-ID mapping in SSM",
  builder,
  handler,
};

export async function main(args: string[] = process.argv) {
  await runCommand(command, args);
}
