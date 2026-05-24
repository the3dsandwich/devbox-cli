import Conf from "conf";

interface DevboxConfig {
  serverUrl: string;
  token: string;
  sshKey: string;
}

export const config = new Conf<DevboxConfig>({ projectName: "devbox" });

export const getServerUrl = (): string => {
  const url = config.get("serverUrl");
  if (!url) throw new Error("Not logged in. Run: devbox login");
  return url;
};

export const getToken = (): string => {
  const token = config.get("token");
  if (!token) throw new Error("Not logged in. Run: devbox login");
  return token;
};

export const getSshKey = (): string => {
  const key = config.get("sshKey");
  if (!key) throw new Error("No SSH key configured. Run: devbox login");
  return key;
};
