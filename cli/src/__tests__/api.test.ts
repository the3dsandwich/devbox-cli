import { describe, it, expect, vi, beforeEach } from "vitest";
import axios from "axios";
import { createApiClient } from "../api.js";

vi.mock("axios");
const mockedAxios = vi.mocked(axios, true);

const mockClient = {
  get: vi.fn(),
  post: vi.fn(),
  delete: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  mockedAxios.create = vi.fn().mockReturnValue(mockClient);
});

describe("createApiClient", () => {
  const client = () => createApiClient("http://server.local", "tok");

  it("list calls GET /devboxes", async () => {
    mockClient.get.mockResolvedValue({ data: [] });
    const result = await client().list();
    expect(mockClient.get).toHaveBeenCalledWith("/devboxes");
    expect(result).toEqual([]);
  });

  it("create calls POST /devboxes with name and ssh_key", async () => {
    const devbox = { id: "1", name: "test", status: "provisioning" };
    mockClient.post.mockResolvedValue({ data: devbox });
    const result = await client().create("test", "ssh-ed25519 AAAA...");
    expect(mockClient.post).toHaveBeenCalledWith("/devboxes", {
      name: "test",
      ssh_key: "ssh-ed25519 AAAA...",
    });
    expect(result).toEqual(devbox);
  });

  it("destroy calls DELETE /devboxes/:name", async () => {
    mockClient.delete.mockResolvedValue({ data: undefined });
    await client().destroy("test");
    expect(mockClient.delete).toHaveBeenCalledWith("/devboxes/test");
  });

  it("expose calls POST /devboxes/:name/ports", async () => {
    mockClient.post.mockResolvedValue({ data: { url: "http://test-3000.devbox.local" } });
    const result = await client().expose("test", 3000);
    expect(mockClient.post).toHaveBeenCalledWith("/devboxes/test/ports", { port: 3000 });
    expect(result.url).toBe("http://test-3000.devbox.local");
  });

  it("get calls GET /devboxes/:name", async () => {
    const devbox = { id: "1", name: "test", status: "running", ip: "10.0.0.1", url: "http://test.devbox.local" };
    mockClient.get.mockResolvedValue({ data: devbox });
    const result = await client().get("test");
    expect(mockClient.get).toHaveBeenCalledWith("/devboxes/test");
    expect(result).toEqual(devbox);
  });

  it("unexpose calls DELETE /devboxes/:name/ports/:port", async () => {
    mockClient.delete.mockResolvedValue({ data: undefined });
    await client().unexpose("test", 3000);
    expect(mockClient.delete).toHaveBeenCalledWith("/devboxes/test/ports/3000");
  });
});
