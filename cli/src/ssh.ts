import { execFileSync } from "child_process";
import chalk from "chalk";

export interface SshTarget {
  bin: string;
  args: string[];
  env?: NodeJS.ProcessEnv;
}

// mosh is spawned directly (not via the user's shell), so shell-alias
// workarounds like `alias mosh='export LC_ALL=en_US.UTF-8 && mosh'` never
// run — mosh requires this itself, so set it explicitly instead.
const utf8Locale = (): string => {
  const lang = process.env.LANG ?? "";
  return /utf-?8/i.test(lang) ? lang : "C.UTF-8";
};

const commandExists = (cmd: string): boolean => {
  try {
    execFileSync("which", [cmd], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
};

const remoteHasMosh = (user: string, ip: string): boolean => {
  try {
    execFileSync("ssh", [`${user}@${ip}`, "command -v mosh-server"], {
      stdio: "ignore",
      timeout: 5000,
    });
    return true;
  } catch {
    return false;
  }
};

export const resolveSshTarget = (user: string, ip: string): SshTarget => {
  if (!commandExists("mosh")) {
    return { bin: "ssh", args: [`${user}@${ip}`] };
  }

  console.log(chalk.dim("mosh found locally — checking devbox for mosh support..."));
  if (remoteHasMosh(user, ip)) {
    console.log(chalk.dim("mosh available on both ends — upgrading connection."));
    return {
      bin: "mosh",
      args: [`${user}@${ip}`],
      env: { ...process.env, LC_ALL: utf8Locale() },
    };
  }

  console.log(chalk.dim("mosh not found on devbox — falling back to ssh."));
  return { bin: "ssh", args: [`${user}@${ip}`] };
};
