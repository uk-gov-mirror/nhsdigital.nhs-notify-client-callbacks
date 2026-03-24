import type { Argv } from "yargs";
import {
  type CliCommand,
  type ClientCliArgs,
  clientIdOption,
  commonOptions,
  createRepository,
  runCommand,
} from "src/entrypoint/cli/helper";

export const builder = (yargs: Argv) =>
  yargs.options({
    ...commonOptions,
    ...clientIdOption,
  });

export const handler: CliCommand<ClientCliArgs>["handler"] = async (argv) => {
  const repository = await createRepository(argv);

  const config = await repository.getClientConfig(argv["client-id"]);

  if (config) {
    console.log(JSON.stringify(config, null, 2));
  } else {
    console.log(`No configuration exists for client: ${argv["client-id"]}`);
  }
};

export const command: CliCommand<ClientCliArgs> = {
  command: "clients-get",
  describe: "Get a client configuration",
  builder,
  handler,
};

export async function main(args: string[] = process.argv) {
  await runCommand(command, args);
}
