import httpProxy from "http-proxy";
import type { IncomingMessage, ServerResponse } from "http";
import type { Socket } from "net";

export type ProxyRoute = { ip: string; port: number };

type Logger = { info: (o: unknown, m?: string) => void; error: (o: unknown, m?: string) => void };

export const createProxyRouter = (
  getRoutes: () => Map<string, ProxyRoute>,
  domain: string,
  logger?: Logger
) => {
  const proxy = httpProxy.createProxyServer({ ws: true });

  // DIAGNOSTIC: surface http-proxy errors (proxy.ws errors are emitted, not thrown)
  proxy.on("error", (err, _req, _resOrSocket) => {
    logger?.error({ err: String(err) }, "proxy error");
  });

  // DIAGNOSTIC: confirm the upstream upgrade handshake actually completes
  proxy.on("proxyReqWs", (_proxyReq, req) => {
    logger?.info({ url: req.url, host: req.headers.host }, "proxyReqWs: forwarding WS upstream");
  });
  proxy.on("open", () => logger?.info({}, "proxy ws: upstream socket open"));
  proxy.on("close", () => logger?.info({}, "proxy ws: upstream socket closed"));

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
    const target = `http://${route.ip}:${route.port}`;
    // cloudflared forwards WebSocket upgrades as regular HTTP requests rather than
    // emitting a Node 'upgrade' event — detect and handle them via proxy.ws()
    if (req.headers.upgrade?.toLowerCase() === "websocket") {
      const socket = req.socket as Socket;
      if (logger) {
        logger.info(
          { url: req.url, host: req.headers.host, target, socketWritable: socket.writable },
          "handleHttp: WS upgrade via raw req.socket"
        );
        // DIAGNOSTIC: trace the client socket lifecycle around proxy.ws()
        socket.once("close", (hadErr) =>
          logger.info({ url: req.url, hadErr }, "handleHttp: client socket close")
        );
        socket.once("error", (err) =>
          logger.error({ url: req.url, err: String(err) }, "handleHttp: client socket error")
        );
      }
      proxy.ws(req, socket, Buffer.alloc(0), { target });
    } else {
      proxy.web(req, res, { target });
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
