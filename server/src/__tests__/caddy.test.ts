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
  it("creates server block when routes path does not exist yet", async () => {
    mockGet.mockRejectedValueOnce(new Error("not found"));
    // first PUT (/routes) fails because server block doesn't exist; second PUT (/servers/devbox) succeeds
    mockPut.mockRejectedValueOnce(new Error("not found")).mockResolvedValueOnce({});

    const client = createCaddyClient("http://caddy:2019");
    await client.addRoute("my-box", "10.0.0.100", 8080);

    expect(mockPut).toHaveBeenLastCalledWith("/config/apps/http/servers/devbox", {
      listen: [":80"],
      routes: [
        {
          _subdomain: "my-box",
          match: [{ host: ["my-box.devbox.local"] }],
          handle: [{ handler: "reverse_proxy", upstreams: [{ dial: "10.0.0.100:8080" }] }],
        },
      ],
    });
  });

  it("appends to existing routes without touching others", async () => {
    const existing = [
      {
        _subdomain: "other-box",
        match: [{ host: ["other-box.devbox.local"] }],
        handle: [{ handler: "reverse_proxy", upstreams: [{ dial: "10.0.0.99:8080" }] }],
      },
    ];
    mockGet.mockResolvedValueOnce({ data: existing });
    mockPut.mockResolvedValue({});

    const client = createCaddyClient("http://caddy:2019");
    await client.addRoute("my-box", "10.0.0.100", 8080);

    const written = mockPut.mock.calls[0][1] as unknown[];
    expect(written).toHaveLength(2);
    expect(written[0]).toMatchObject({ _subdomain: "other-box" });
    expect(written[1]).toMatchObject({ _subdomain: "my-box" });
  });

  it("replaces existing route for same subdomain", async () => {
    const existing = [
      {
        _subdomain: "my-box",
        match: [{ host: ["my-box.devbox.local"] }],
        handle: [{ handler: "reverse_proxy", upstreams: [{ dial: "10.0.0.50:8080" }] }],
      },
    ];
    mockGet.mockResolvedValueOnce({ data: existing });
    mockPut.mockResolvedValue({});

    const client = createCaddyClient("http://caddy:2019");
    await client.addRoute("my-box", "10.0.0.100", 8080);

    const written = mockPut.mock.calls[0][1] as unknown[];
    expect(written).toHaveLength(1);
    expect(written[0]).toMatchObject({
      _subdomain: "my-box",
      handle: [{ handler: "reverse_proxy", upstreams: [{ dial: "10.0.0.100:8080" }] }],
    });
  });

  it("uses custom domain when provided", async () => {
    mockGet.mockResolvedValueOnce({ data: [] });
    mockPut.mockResolvedValue({});

    const client = createCaddyClient("http://caddy:2019");
    await client.addRoute("my-box-3000", "10.0.0.100", 3000, "mycompany.com");

    const written = mockPut.mock.calls[0][1] as unknown[];
    expect(written[0]).toMatchObject({
      match: [{ host: ["my-box-3000.mycompany.com"] }],
    });
  });
});

describe("removeRoute", () => {
  it("removes route by subdomain and writes remaining routes", async () => {
    const existing = [
      {
        _subdomain: "my-box",
        match: [{ host: ["my-box.devbox.local"] }],
        handle: [],
      },
      {
        _subdomain: "other-box",
        match: [{ host: ["other-box.devbox.local"] }],
        handle: [],
      },
    ];
    mockGet.mockResolvedValueOnce({ data: existing });
    mockPut.mockResolvedValue({});

    const client = createCaddyClient("http://caddy:2019");
    await client.removeRoute("my-box");

    const written = mockPut.mock.calls[0][1] as unknown[];
    expect(written).toHaveLength(1);
    expect(written[0]).toMatchObject({ _subdomain: "other-box" });
  });

  it("is a no-op when subdomain does not exist", async () => {
    mockGet.mockResolvedValueOnce({ data: [] });
    mockPut.mockResolvedValue({});

    const client = createCaddyClient("http://caddy:2019");
    await client.removeRoute("ghost");

    expect(mockPut).toHaveBeenCalledWith("/config/apps/http/servers/devbox/routes", []);
  });
});
