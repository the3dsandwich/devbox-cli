import { describe, it, expect, vi, beforeEach } from "vitest";
import { createCaddyClient } from "../caddy.js";

const mockGet = vi.fn();
const mockPost = vi.fn();
const mockPut = vi.fn();
const mockDelete = vi.fn();

vi.mock("axios", () => ({
  default: {
    create: () => ({ get: mockGet, post: mockPost, put: mockPut, delete: mockDelete }),
  },
}));

beforeEach(() => vi.clearAllMocks());

describe("addRoute", () => {
  it("initializes server config if routes do not exist, then appends route", async () => {
    mockGet.mockRejectedValueOnce(new Error("not found"));
    mockPut.mockResolvedValueOnce({});
    mockPost.mockResolvedValueOnce({});

    const client = createCaddyClient("http://caddy:2019");
    await client.addRoute("my-box", "10.0.0.100", 8080);

    expect(mockPut).toHaveBeenCalledWith("/config/apps/http/servers/devbox", {
      listen: [":80"],
      routes: [],
    });
    expect(mockPost).toHaveBeenCalledWith("/config/apps/http/servers/devbox/routes/...", {
      "@id": "my-box",
      match: [{ host: ["my-box.devbox.local"] }],
      handle: [
        {
          handler: "reverse_proxy",
          upstreams: [{ dial: "10.0.0.100:8080" }],
        },
      ],
    });
  });

  it("skips initialization if routes already exist", async () => {
    mockGet.mockResolvedValueOnce({ data: [] });
    mockPost.mockResolvedValueOnce({});

    const client = createCaddyClient("http://caddy:2019");
    await client.addRoute("my-box", "10.0.0.100", 8080);

    expect(mockPut).not.toHaveBeenCalled();
    expect(mockPost).toHaveBeenCalledOnce();
  });

  it("uses correct subdomain and dial for port expose", async () => {
    mockGet.mockResolvedValueOnce({ data: [] });
    mockPost.mockResolvedValueOnce({});

    const client = createCaddyClient("http://caddy:2019");
    await client.addRoute("my-box-3000", "10.0.0.100", 3000);

    expect(mockPost).toHaveBeenCalledWith("/config/apps/http/servers/devbox/routes/...", {
      "@id": "my-box-3000",
      match: [{ host: ["my-box-3000.devbox.local"] }],
      handle: [
        {
          handler: "reverse_proxy",
          upstreams: [{ dial: "10.0.0.100:3000" }],
        },
      ],
    });
  });
});

describe("removeRoute", () => {
  it("deletes route by @id", async () => {
    mockDelete.mockResolvedValueOnce({});

    const client = createCaddyClient("http://caddy:2019");
    await client.removeRoute("my-box");

    expect(mockDelete).toHaveBeenCalledWith("/id/my-box");
  });
});
