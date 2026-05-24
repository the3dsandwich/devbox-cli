import axios from "axios";

export interface CaddyClient {
  addRoute: (subdomain: string, targetHost: string, targetPort: number) => Promise<void>;
  removeRoute: (subdomain: string) => Promise<void>;
}

export const createCaddyClient = (adminUrl: string): CaddyClient => {
  const client = axios.create({ baseURL: adminUrl });

  const ensureRoutesExist = async () => {
    try {
      await client.get("/config/apps/http/servers/devbox/routes");
    } catch {
      // initialize the server config with an empty routes array
      await client.put("/config/apps/http/servers/devbox", {
        listen: [":80"],
        routes: [],
      });
    }
  };

  const addRoute = async (subdomain: string, targetHost: string, targetPort: number) => {
    await ensureRoutesExist();
    await client.post("/config/apps/http/servers/devbox/routes/...", {
      "@id": subdomain,
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
    await client.delete(`/id/${subdomain}`);
  };

  return { addRoute, removeRoute };
};
