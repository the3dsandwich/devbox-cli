import { createInterface } from "readline";
import { readFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { config } from "../config.js";
import { createApiClient } from "../api.js";

const prompt = (question: string, fallback?: string): Promise<string> =>
  new Promise((resolve) => {
    if (fallback) { resolve(fallback); return; }
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (answer) => { rl.close(); resolve(answer.trim()); });
  });

const defaultSshKey = (): string | undefined => {
  for (const name of ["id_ed25519.pub", "id_rsa.pub", "id_ecdsa.pub"]) {
    try { return readFileSync(join(homedir(), ".ssh", name), "utf8").trim(); } catch {}
  }
};

export const login = async (serverUrl: string) => {
  const token = await prompt(
    "API token (or set DEVBOX_TOKEN): ",
    process.env.DEVBOX_TOKEN
  );

  const detectedKey = defaultSshKey();
  const sshKey = await prompt(
    detectedKey
      ? `SSH public key [${detectedKey.split(" ").slice(0, 2).join(" ").slice(0, 40)}...]: `
      : "SSH public key (e.g. contents of ~/.ssh/id_ed25519.pub, or set DEVBOX_SSH_KEY): ",
    process.env.DEVBOX_SSH_KEY ?? detectedKey
  );

  if (!token) throw new Error("API token is required");
  if (!sshKey) throw new Error("SSH public key is required");

  const client = createApiClient(serverUrl, token);
  await client.list(); // verify credentials

  config.set("serverUrl", serverUrl.replace(/\/$/, ""));
  config.set("token", token);
  config.set("sshKey", sshKey);

  console.log(`Logged in to ${serverUrl}`);
};
