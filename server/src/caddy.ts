import axios from "axios";

export interface CaddyClient {
  addRoute: (subdomain: string, targetHost: string, targetPort: number, domain?: string) => Promise<void>;
  removeRoute: (subdomain: string) => Promise<void>;
}

type CaddyRoute = {
  match?: { host?: string[] }[];
  handle?: unknown[];
  _subdomain?: string;
};

export const createCaddyClient = (adminUrl: string): CaddyClient => {
  const client = axios.create({ baseURL: adminUrl });

  const getRoutes = async (): Promise<CaddyRoute[]> => {
    try {
      const res = await client.get("/config/apps/http/servers/devbox/routes");
      return res.data ?? [];
    } catch {
      return [];
    }
  };

  const putRoutes = async (routes: CaddyRoute[]) => {
    try {
      await client.put("/config/apps/http/servers/devbox/routes", routes);
    } catch {
      // server block doesn't exist yet — create it
      await client.put("/config/apps/http/servers/devbox", {
        listen: [":80"],
        routes,
      });
    }
  };

  const addRoute = async (subdomain: string, targetHost: string, targetPort: number, domain = "devbox.local") => {
    const routes = await getRoutes();
    const filtered = routes.filter((r) => r._subdomain !== subdomain);
    const newRoute: CaddyRoute = {
      _subdomain: subdomain,
      match: [{ host: [`${subdomain}.${domain}`] }],
      handle: [{ handler: "reverse_proxy", upstreams: [{ dial: `${targetHost}:${targetPort}` }] }],
    };
    await putRoutes([...filtered, newRoute]);
  };

  const removeRoute = async (subdomain: string) => {
    const routes = await getRoutes();
    await putRoutes(routes.filter((r) => r._subdomain !== subdomain));
  };

  return { addRoute, removeRoute };
};
