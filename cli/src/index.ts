#!/usr/bin/env node
import { Command } from "commander";
import chalk from "chalk";
import Table from "cli-table3";
import { login } from "./commands/login.js";
import { getApiClient } from "./api.js";
import { getSshKey } from "./config.js";

const program = new Command();

program.name("devbox").description("Manage personal devboxes").version("0.1.0");

program
  .command("login <server-url>")
  .description("Authenticate against a devbox server")
  .action(async (serverUrl: string) => {
    await login(serverUrl).catch(die);
  });

program
  .command("list")
  .alias("ls")
  .description("List all devboxes")
  .action(async () => {
    const devboxes = await getApiClient().list().catch(die);
    if (!devboxes.length) { console.log("No devboxes."); return; }
    const table = new Table({ head: ["Name", "Status", "IP", "VS Code URL"] });
    for (const d of devboxes) {
      table.push([
        d.name,
        statusColor(d.status),
        d.ip ?? "-",
        d.ip ? chalk.cyan(`http://${d.name}.devbox.local`) : "-",
      ]);
    }
    console.log(table.toString());
  });

program
  .command("create <name>")
  .description("Create a new devbox")
  .option("--no-wait", "return immediately after request instead of waiting for running state")
  .action(async (name: string, opts: { wait: boolean }) => {
    const sshKey = getSshKey();
    const api = getApiClient();
    await api.create(name, sshKey).catch(die);

    if (!opts.wait) {
      console.log(`Provisioning started. Check status with: devbox status ${name}`);
      return;
    }

    const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
    let frame = 0;
    const interval = setInterval(() => {
      process.stdout.write(`\r${frames[frame++ % frames.length]} Provisioning ${chalk.bold(name)}...`);
    }, 100);

    const timeoutMs = 5 * 60 * 1000;
    const deadline = Date.now() + timeoutMs;

    try {
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 3000));
        const devbox = await api.get(name).catch(() => null);
        if (!devbox) continue;
        if (devbox.status === "running") {
          clearInterval(interval);
          process.stdout.write("\r" + " ".repeat(50) + "\r");
          console.log(`${chalk.green("✓")} ${chalk.bold(name)} is running`);
          console.log(`  IP:      ${devbox.ip}`);
          console.log(`  VS Code: ${chalk.cyan(`http://${name}.devbox.local`)}`);
          return;
        }
        if (devbox.status === "stopped") {
          clearInterval(interval);
          process.stdout.write("\r" + " ".repeat(50) + "\r");
          die(new Error(`Provisioning failed — check server logs`));
        }
      }
      clearInterval(interval);
      process.stdout.write("\r" + " ".repeat(50) + "\r");
      die(new Error(`Timed out waiting for ${name} to start`));
    } catch (err) {
      clearInterval(interval);
      throw err;
    }
  });

program
  .command("status <name>")
  .description("Get devbox status")
  .action(async (name: string) => {
    const devbox = await getApiClient().get(name).catch(die);
    console.log(`${chalk.bold(devbox.name)}  ${statusColor(devbox.status)}`);
    if (devbox.ip) {
      console.log(`  IP:      ${devbox.ip}`);
      console.log(`  VS Code: ${chalk.cyan(`http://${devbox.name}.devbox.local`)}`);
    }
  });

program
  .command("destroy <name>")
  .description("Destroy a devbox")
  .action(async (name: string) => {
    await getApiClient().destroy(name).catch(die);
    console.log(`Destroyed ${chalk.bold(name)}.`);
  });

program
  .command("open <name>")
  .description("Print VS Code URL for a devbox")
  .action(async (name: string) => {
    const devbox = await getApiClient().get(name).catch(die);
    if (!devbox.ip) { console.error("Devbox has no IP yet."); process.exit(1); }
    const url = `http://${devbox.name}.devbox.local`;
    console.log(chalk.cyan(url));
  });

program
  .command("expose <name> <port>")
  .description("Expose a port from a devbox")
  .action(async (name: string, port: string) => {
    const result = await getApiClient().expose(name, parseInt(port, 10)).catch(die);
    console.log(`Exposed at ${chalk.cyan(result.url)}`);
  });

program
  .command("unexpose <name> <port>")
  .description("Remove an exposed port")
  .action(async (name: string, port: string) => {
    await getApiClient().unexpose(name, parseInt(port, 10)).catch(die);
    console.log(`Port ${port} unexposed.`);
  });

program
  .command("ssh <name>")
  .description("SSH into a devbox")
  .action(async (name: string) => {
    const devbox = await getApiClient().get(name).catch(die);
    if (!devbox.ip) { console.error("Devbox has no IP yet."); process.exit(1); }
    const { execFileSync } = await import("child_process");
    execFileSync("ssh", [`weiwei@${devbox.ip}`], { stdio: "inherit" });
  });

const statusColor = (status: string) => {
  if (status === "running") return chalk.green(status);
  if (status === "provisioning") return chalk.yellow(status);
  if (status === "stopped") return chalk.gray(status);
  return chalk.red(status);
};

const die = (err: unknown): never => {
  console.error(chalk.red(err instanceof Error ? err.message : String(err)));
  process.exit(1);
};

program.parse();
