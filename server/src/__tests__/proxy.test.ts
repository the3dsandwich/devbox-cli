import { describe, it, expect, vi, beforeEach } from "vitest";
import type { IncomingMessage, ServerResponse } from "http";
import type { Socket } from "net";
import { createProxyRouter } from "../proxy.js";

const mockWeb = vi.fn();
const mockWs = vi.fn();
const mockOn = vi.fn();
vi.mock("http-proxy", () => ({
  default: {
    createProxyServer: () => ({ web: mockWeb, ws: mockWs, on: mockOn }),
  },
}));

const makeReq = (host: string, url = "/", extraHeaders: Record<string, string> = {}) =>
  ({ headers: { host, ...extraHeaders }, url, socket: {} }) as unknown as IncomingMessage;

const makeRes = () =>
  ({ writeHead: vi.fn(), end: vi.fn() }) as unknown as ServerResponse;

const makeSocket = () => ({ destroy: vi.fn() }) as unknown as Socket;

const routes = new Map([
  ["my-box", { ip: "10.0.0.100", port: 8080 }],
  ["my-box-3000", { ip: "10.0.0.100", port: 3000 }],
]);

beforeEach(() => vi.clearAllMocks());

describe("createProxyRouter", () => {
  describe("handleHttp", () => {
    it("proxies request matching a known subdomain", () => {
      const { handleHttp } = createProxyRouter(() => routes, "devbox.local");
      const req = makeReq("my-box.devbox.local");
      const res = makeRes();

      handleHttp(req, res);

      expect(mockWeb).toHaveBeenCalledWith(req, res, { target: "http://10.0.0.100:8080" });
    });

    it("proxies port-exposed subdomain", () => {
      const { handleHttp } = createProxyRouter(() => routes, "devbox.local");
      const req = makeReq("my-box-3000.devbox.local");
      const res = makeRes();

      handleHttp(req, res);

      expect(mockWeb).toHaveBeenCalledWith(req, res, { target: "http://10.0.0.100:3000" });
    });

    it("returns false for unknown subdomain", () => {
      const { handleHttp } = createProxyRouter(() => routes, "devbox.local");
      const req = makeReq("ghost.devbox.local");
      const res = makeRes();

      const handled = handleHttp(req, res);

      expect(handled).toBe(false);
      expect(mockWeb).not.toHaveBeenCalled();
    });

    it("returns false when host does not match domain", () => {
      const { handleHttp } = createProxyRouter(() => routes, "devbox.local");
      const req = makeReq("my-box.other.com");
      const res = makeRes();

      const handled = handleHttp(req, res);

      expect(handled).toBe(false);
      expect(mockWeb).not.toHaveBeenCalled();
    });

    it("returns false when host header is absent", () => {
      const { handleHttp } = createProxyRouter(() => routes, "devbox.local");
      const req = makeReq("");
      const res = makeRes();

      const handled = handleHttp(req, res);

      expect(handled).toBe(false);
      expect(mockWeb).not.toHaveBeenCalled();
    });

    it("uses proxy.ws() via raw socket when Upgrade: websocket header is present", () => {
      const { handleHttp } = createProxyRouter(() => routes, "devbox.local");
      const req = makeReq("my-box.devbox.local", "/", { upgrade: "websocket" });
      const res = makeRes();

      const handled = handleHttp(req, res);

      expect(handled).toBe(true);
      expect(mockWeb).not.toHaveBeenCalled();
      expect(mockWs).toHaveBeenCalledWith(
        req,
        req.socket,
        expect.any(Buffer),
        { target: "http://10.0.0.100:8080" }
      );
    });
  });

  describe("handleUpgrade", () => {
    it("proxies WebSocket upgrade for known subdomain", () => {
      const { handleUpgrade } = createProxyRouter(() => routes, "devbox.local");
      const req = makeReq("my-box.devbox.local");
      const socket = makeSocket();
      const head = Buffer.alloc(0);

      const handled = handleUpgrade(req, socket, head);

      expect(handled).toBe(true);
      expect(mockWs).toHaveBeenCalledWith(req, socket, head, { target: "http://10.0.0.100:8080" });
    });

    it("proxies WebSocket upgrade for port-exposed subdomain", () => {
      const { handleUpgrade } = createProxyRouter(() => routes, "devbox.local");
      const req = makeReq("my-box-3000.devbox.local");
      const socket = makeSocket();
      const head = Buffer.alloc(0);

      const handled = handleUpgrade(req, socket, head);

      expect(handled).toBe(true);
      expect(mockWs).toHaveBeenCalledWith(req, socket, head, { target: "http://10.0.0.100:3000" });
    });

    it("returns false for unknown subdomain on upgrade", () => {
      const { handleUpgrade } = createProxyRouter(() => routes, "devbox.local");
      const req = makeReq("ghost.devbox.local");
      const socket = makeSocket();
      const head = Buffer.alloc(0);

      const handled = handleUpgrade(req, socket, head);

      expect(handled).toBe(false);
      expect(mockWs).not.toHaveBeenCalled();
    });

    it("returns false when host does not match domain on upgrade", () => {
      const { handleUpgrade } = createProxyRouter(() => routes, "devbox.local");
      const req = makeReq("my-box.other.com");
      const socket = makeSocket();
      const head = Buffer.alloc(0);

      const handled = handleUpgrade(req, socket, head);

      expect(handled).toBe(false);
      expect(mockWs).not.toHaveBeenCalled();
    });
  });
});
