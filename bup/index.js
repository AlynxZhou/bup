import {Command} from "commander";
import {getVersion} from "./utils.js";
import bup from "./bup.js";

const command = new Command();

command
  .version(getVersion(), "-v, --version", "Print version number.")
  .usage("[options] [dir]")
  .description(`BUp v${getVersion()}`)
  .argument("[dir]", "Project dir.")
  .option("-d, --debug", "Enable debug output.")
  .option("-c, --config <json>", "Alternative config path.")
  .option("-C, --no-color", "Disable colored output.")
  .helpOption("-h, --help", "Print help information.")
  .action((dir, opts) => {
    bup(dir || ".", opts);
  });

// Handle unknown commands.
command.on("command:*", () => {
  console.error(`Invalid command: ${command.args.join(" ")}`);
  console.error("Run `bup --help` for a list of available commands.");
  process.exit(1);
});

const main = (argv = process.argv) => {
  command.parse(argv);
};

export default main;
