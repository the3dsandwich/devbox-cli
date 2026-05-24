import axios from "axios";

export interface CaddyClient {
  addRoute: (subdomain: string, targetHost: string, targetPort: number) => Promise<void>;
  removeRoute: (subdomain: string) => Promise<void>;
}

export const createCaddyClient = (adminUrl: string): CaddyClient => {
  const client = axios.create({ baseURL: adminUrl });

  const addRoute = async (subdomain: string, targetHost: string, targetPort: number) => {
    await client.put(`/config/apps/http/servers/devbox/routes/${subdomain}`, {
      match: [{ host: [`${subdomain}.devbox.local`] }],
      handle: [
        {
          handler: "reverse_proxy",
          upstreams: [{ dial: `${targetHost}:${targetPort}` }],
        },
      ],
    });
  };

  const removeRoute = async (subdomain: string) => {
    await client.delete(`/config/apps/http/servers/devbox/routes/${subdomain}`);
  };

  return { addRoute, removeRoute };
};
