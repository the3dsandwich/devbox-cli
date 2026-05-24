import axios from "axios";
import { getServerUrl, getToken } from "./config.js";

export interface DevboxRecord {
  id: string;
  name: string;
  proxmox_vmid: number;
  ip: string | null;
  url: string | null;
  status: string;
  created_at: string;
}

export const createApiClient = (serverUrl: string, token: string) => {
  const client = axios.create({
    baseURL: serverUrl,
    headers: { Authorization: `Bearer ${token}` },
  });

  return {
    list: (): Promise<DevboxRecord[]> =>
      client.get("/devboxes").then((r) => r.data),

    create: (name: string, sshKey: string): Promise<DevboxRecord> =>
      client.post("/devboxes", { name, ssh_key: sshKey }).then((r) => r.data),

    get: (name: string): Promise<DevboxRecord> =>
      client.get(`/devboxes/${name}`).then((r) => r.data),

    destroy: (name: string): Promise<void> =>
      client.delete(`/devboxes/${name}`).then(() => undefined),

    expose: (name: string, port: number): Promise<{ url: string }> =>
      client.post(`/devboxes/${name}/ports`, { port }).then((r) => r.data),

    unexpose: (name: string, port: number): Promise<void> =>
      client.delete(`/devboxes/${name}/ports/${port}`).then(() => undefined),
  };
};

export const getApiClient = () => createApiClient(getServerUrl(), getToken());
