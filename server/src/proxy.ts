import httpProxy from "http-proxy";
import type { IncomingMessage, ServerResponse } from "http";

export type ProxyRoute = { ip: string; port: number };

export const createProxyRouter = (
  getRoutes: () => Map<string, ProxyRoute>,
  domain: string
) => {
  const proxy = httpProxy.createProxyServer();

  return (req: IncomingMessage, res: ServerResponse): boolean => {
    const host = req.headers.host ?? "";
    const suffix = `.${domain}`;
    if (!host.endsWith(suffix)) return false;

    const subdomain = host.slice(0, host.length - suffix.length);
    if (!subdomain) return false;

    const route = getRoutes().get(subdomain);
    if (!route) return false;

    proxy.web(req, res, { target: `http://${route.ip}:${route.port}` });
    return true;
  };
};
