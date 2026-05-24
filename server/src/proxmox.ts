import axios from "axios";
import https from "https";

export interface ProxmoxConfig {
  host: string;
  tokenId: string;
  tokenSecret: string;
  node: string;
  templateVmid: number;
  vmidRangeStart: number;
}

export interface ProxmoxClient {
  cloneVm: (name: string, vmid: number, lockTimeoutMs?: number) => Promise<void>;
  setCloudInit: (vmid: number, sshKey: string) => Promise<void>;
  startVm: (vmid: number) => Promise<void>;
  stopVm: (vmid: number) => Promise<void>;
  destroyVm: (vmid: number) => Promise<void>;
  getVmIp: (vmid: number) => Promise<string | null>;
  nextVmid: () => Promise<number>;
}

export const createProxmoxClient = (config: ProxmoxConfig): ProxmoxClient => {
  const client = axios.create({
    baseURL: `https://${config.host}:8006/api2/json`,
    headers: { Authorization: `PVEAPIToken=${config.tokenId}=${config.tokenSecret}` },
    httpsAgent: new https.Agent({ rejectUnauthorized: false }),
  });

  const nodeBase = `/nodes/${config.node}`;

  const waitForUnlock = async (vmid: number, timeoutMs = 60000) => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const res = await client.get(`${nodeBase}/qemu/${vmid}/config`);
      if (!res.data?.data?.lock) return;
      await new Promise((r) => setTimeout(r, 2000));
    }
    throw new Error(`VM ${vmid} still locked after ${timeoutMs}ms`);
  };

  const cloneVm = async (name: string, vmid: number, lockTimeoutMs = 60000) => {
    await client.post(`${nodeBase}/qemu/${config.templateVmid}/clone`, {
      newid: vmid,
      name,
      full: 1,
    });
    await waitForUnlock(vmid, lockTimeoutMs);
  };

  const setCloudInit = async (vmid: number, sshKey: string) => {
    await client.post(`${nodeBase}/qemu/${vmid}/config`, {
      ipconfig0: "ip=dhcp",
      sshkeys: encodeURIComponent(sshKey),
    });
  };

  const startVm = async (vmid: number) => {
    await client.post(`${nodeBase}/qemu/${vmid}/status/start`);
  };

  const stopVm = async (vmid: number) => {
    await client.post(`${nodeBase}/qemu/${vmid}/status/stop`);
  };

  const destroyVm = async (vmid: number) => {
    await client.delete(`${nodeBase}/qemu/${vmid}`);
  };

  const getVmIp = async (vmid: number): Promise<string | null> => {
    try {
      const res = await client.get(`${nodeBase}/qemu/${vmid}/agent/network-get-interfaces`);
      const ifaces = res.data?.data?.result ?? [];
      for (const iface of ifaces) {
        if (iface.name === "eth0" || iface.name === "ens18") {
          const v4 = iface["ip-addresses"]?.find(
            (a: { "ip-address-type": string; "ip-address": string }) =>
              a["ip-address-type"] === "ipv4"
          );
          if (v4) return v4["ip-address"];
        }
      }
      return null;
    } catch {
      return null;
    }
  };

  const nextVmid = async (): Promise<number> => {
    const res = await client.get("/cluster/nextid");
    return parseInt(res.data.data, 10);
  };

  return { cloneVm, setCloudInit, startVm, stopVm, destroyVm, getVmIp, nextVmid };
};
