#!/usr/bin/env node
import { Command } from "commander";
import chalk from "chalk";
import Table from "cli-table3";
import { login } from "./commands/login.js";
import { getApiClient } from "./api.js";
import { getSshKey } from "./config.js";
import { withSpinner } from "./spinner.js";
import { resolveSshTarget } from "./ssh.js";

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
        d.url ? chalk.cyan(d.url) : "-",
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

    const timeoutMs = 5 * 60 * 1000;
    const deadline = Date.now() + timeoutMs;

    const devbox = await withSpinner(`Provisioning ${chalk.bold(name)}`, async () => {
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 3000));
        const d = await api.get(name).catch(() => null);
        if (!d) continue;
        if (d.status === "running") return d;
        if (d.status === "stopped") throw new Error("Provisioning failed — check server logs");
      }
      throw new Error(`Timed out waiting for ${name} to start`);
    }).catch(die);

    console.log(`${chalk.green("✓")} ${chalk.bold(name)} is running`);
    console.log(`  IP:      ${devbox.ip}`);
    if (devbox.url) console.log(`  VS Code: ${chalk.cyan(devbox.url)}`);
    console.log(`  Password: ssh ${devbox.ip} "cat ~/.config/code-server/config.yaml"`);
  });

program
  .command("status <name>")
  .description("Get devbox status")
  .action(async (name: string) => {
    const devbox = await getApiClient().get(name).catch(die);
    console.log(`${chalk.bold(devbox.name)}  ${statusColor(devbox.status)}`);
    if (devbox.ip) {
      console.log(`  IP:      ${devbox.ip}`);
      if (devbox.url) console.log(`  VS Code: ${chalk.cyan(devbox.url)}`);
    }
  });

program
  .command("destroy <name>")
  .description("Destroy a devbox")
  .action(async (name: string) => {
    await withSpinner(`Destroying ${chalk.bold(name)}`, () => getApiClient().destroy(name)).catch(die);
    console.log(`${chalk.green("✓")} Destroyed ${chalk.bold(name)}.`);
  });

program
  .command("open <name>")
  .description("Print VS Code URL for a devbox")
  .action(async (name: string) => {
    const devbox = await getApiClient().get(name).catch(die);
    if (!devbox.url) { console.error("Devbox has no URL yet."); process.exit(1); }
    console.log(chalk.cyan(devbox.url));
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
  .description("SSH into a devbox (uses mosh automatically when available on both ends)")
  .option("--no-mosh", "always use plain ssh")
  .action(async (name: string, opts: { mosh: boolean }) => {
    const devbox = await getApiClient().get(name).catch(die);
    if (!devbox.ip) { console.error("Devbox has no IP yet."); process.exit(1); }
    const { execFileSync } = await import("child_process");
    const target = opts.mosh
      ? resolveSshTarget("weiwei", devbox.ip)
      : { bin: "ssh", args: [`weiwei@${devbox.ip}`] };
    execFileSync(target.bin, target.args, { stdio: "inherit", env: target.env ?? process.env });
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
