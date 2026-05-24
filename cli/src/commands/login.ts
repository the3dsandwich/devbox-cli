import { createInterface } from "readline";
import { config } from "../config.js";
import { createApiClient } from "../api.js";

const prompt = (question: string): Promise<string> =>
  new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (answer) => { rl.close(); resolve(answer.trim()); });
  });

export const login = async (serverUrl: string) => {
  const token = await prompt("API token: ");
  const sshKey = await prompt("SSH public key: ");

  const client = createApiClient(serverUrl, token);
  await client.list(); // verify credentials

  config.set("serverUrl", serverUrl.replace(/\/$/, ""));
  config.set("token", token);
  config.set("sshKey", sshKey);

  console.log(`Logged in to ${serverUrl}`);
};
