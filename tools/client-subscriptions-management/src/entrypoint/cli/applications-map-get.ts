import type { Argv } from "yargs";
import {
  type CliCommand,
  type ClientCliArgs,
  type SsmCliArgs,
  clientIdOption,
  commonOptions,
  createSsmApplicationsMapRepository,
  parameterNameOption,
  runCommand,
} from "src/entrypoint/cli/helper";

type ApplicationsMapGetArgs = ClientCliArgs & SsmCliArgs;

export const builder = (yargs: Argv) =>
  yargs.options({
    ...commonOptions,
    ...clientIdOption,
    ...parameterNameOption,
  });

export const handler: CliCommand<ApplicationsMapGetArgs>["handler"] = async (
  argv,
) => {
  const repository = createSsmApplicationsMapRepository(argv);
  const applicationId = await repository.getApplication(argv["client-id"]);

  if (applicationId) {
    console.log(applicationId);
  } else {
    throw new Error(
      `No application mapping exists for client: ${argv["client-id"]}`,
    );
  }
};

export const command: CliCommand<ApplicationsMapGetArgs> = {
  command: "applications-map-get",
  describe: "Get the application ID mapped to a client",
  builder,
  handler,
};

export async function main(args: string[] = process.argv) {
  await runCommand(command, args);
}
