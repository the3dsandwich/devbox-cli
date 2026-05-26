import httpProxy from "http-proxy";
import type { IncomingMessage, ServerResponse } from "http";
import type { Socket } from "net";

export type ProxyRoute = { ip: string; port: number };

export const createProxyRouter = (
  getRoutes: () => Map<string, ProxyRoute>,
  domain: string
) => {
  const proxy = httpProxy.createProxyServer({ ws: true });

  const resolveRoute = (host: string): ProxyRoute | undefined => {
    const suffix = `.${domain}`;
    if (!host.endsWith(suffix)) return undefined;
    const subdomain = host.slice(0, host.length - suffix.length);
    if (!subdomain) return undefined;
    return getRoutes().get(subdomain);
  };

  const handleHttp = (req: IncomingMessage, res: ServerResponse): boolean => {
    const route = resolveRoute(req.headers.host ?? "");
    if (!route) return false;
    // cloudflared forwards WebSocket upgrades as regular HTTP requests rather than
    // emitting a Node 'upgrade' event — detect and handle them via proxy.ws()
    if (req.headers.upgrade?.toLowerCase() === "websocket") {
      proxy.ws(req, req.socket as Socket, Buffer.alloc(0), { target: `http://${route.ip}:${route.port}` });
    } else {
      proxy.web(req, res, { target: `http://${route.ip}:${route.port}` });
    }
    return true;
  };

  const handleUpgrade = (req: IncomingMessage, socket: Socket, head: Buffer): boolean => {
    const route = resolveRoute(req.headers.host ?? "");
    if (!route) return false;
    proxy.ws(req, socket, head, { target: `http://${route.ip}:${route.port}` });
    return true;
  };

  return { handleHttp, handleUpgrade };
};
