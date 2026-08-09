import { execFileSync } from "child_process";

export interface SshTarget {
  bin: string;
  args: string[];
}

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
  if (commandExists("mosh") && remoteHasMosh(user, ip)) {
    return { bin: "mosh", args: [`${user}@${ip}`] };
  }
  return { bin: "ssh", args: [`${user}@${ip}`] };
};
