import {Command} from "commander";
import build from "./build.js";
import {getVersion} from "./utils.js";

const command = new Command();

command
  .version(getVersion(), "-v, --version", "Print version number.")
  .usage("<subcommand> [options] [dir]")
  .description(`BUp v${getVersion()}`)
  .helpOption("-h, --help", "Print help information.")
  .addHelpCommand("help [subcommand]", "Print help information.");

// command.command("check").alias("c")
//   .argument("[dir]", "Project dir.")
//   .description("C.")
//   .option("-d, --debug", "Enable debug output.")
//   .option("-c, --config <json>", "Alternative config path.")
//   .option("-C, --no-color", "Disable colored output.")
//   .helpOption("-h, --help", "Print help information.")
//   .action((dir, opts) => {
//     check(dir || ".", opts);
//   });

command.command("build").alias("b")
  .argument("[dir]", "Project dir.")
  .description("Build gallery.")
  .option("-d, --debug", "Enable debug output.")
  .option("-c, --config <json>", "Alternative config path.")
  .option("-C, --no-color", "Disable colored output.")
  .helpOption("-h, --help", "Print help information.")
  .action((dir, opts) => {
    build(dir || ".", opts);
  });

// Handle unknown commands.
command.on("command:*", () => {
  console.error(`Invalid command: ${command.args.join(" ")}`);
  console.error("Run `bup --help` for a list of available commands.");
  process.exit(1);
});

const bup = (argv = process.argv) => {
  command.parse(argv);
};

export default bup;
