import { describe, it, expect, vi, beforeEach } from "vitest";
import type { IncomingMessage, ServerResponse } from "http";
import { createProxyRouter } from "../proxy.js";

const mockWeb = vi.fn();
vi.mock("http-proxy", () => ({
  default: {
    createProxyServer: () => ({ web: mockWeb }),
  },
}));

const makeReq = (host: string, url = "/") =>
  ({ headers: { host }, url, socket: {} }) as unknown as IncomingMessage;

const makeRes = () => {
  const res = {
    writeHead: vi.fn(),
    end: vi.fn(),
  } as unknown as ServerResponse;
  return res;
};

const routes = new Map([
  ["my-box", { ip: "10.0.0.100", port: 8080 }],
  ["my-box-3000", { ip: "10.0.0.100", port: 3000 }],
]);

beforeEach(() => vi.clearAllMocks());

describe("createProxyRouter", () => {
  it("proxies request matching a known subdomain", () => {
    const router = createProxyRouter(() => routes, "devbox.local");
    const req = makeReq("my-box.devbox.local");
    const res = makeRes();

    router(req, res);

    expect(mockWeb).toHaveBeenCalledWith(req, res, { target: "http://10.0.0.100:8080" });
  });

  it("proxies port-exposed subdomain", () => {
    const router = createProxyRouter(() => routes, "devbox.local");
    const req = makeReq("my-box-3000.devbox.local");
    const res = makeRes();

    router(req, res);

    expect(mockWeb).toHaveBeenCalledWith(req, res, { target: "http://10.0.0.100:3000" });
  });

  it("returns false for unknown subdomain", () => {
    const router = createProxyRouter(() => routes, "devbox.local");
    const req = makeReq("ghost.devbox.local");
    const res = makeRes();

    const handled = router(req, res);

    expect(handled).toBe(false);
    expect(mockWeb).not.toHaveBeenCalled();
  });

  it("returns false when host does not match domain", () => {
    const router = createProxyRouter(() => routes, "devbox.local");
    const req = makeReq("my-box.other.com");
    const res = makeRes();

    const handled = router(req, res);

    expect(handled).toBe(false);
    expect(mockWeb).not.toHaveBeenCalled();
  });

  it("returns false when host header is absent", () => {
    const router = createProxyRouter(() => routes, "devbox.local");
    const req = makeReq("");
    const res = makeRes();

    const handled = router(req, res);

    expect(handled).toBe(false);
    expect(mockWeb).not.toHaveBeenCalled();
  });
});
