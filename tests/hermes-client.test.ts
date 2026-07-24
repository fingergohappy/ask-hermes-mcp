import { describe, expect, it } from "vitest";

import type { Settings } from "../src/config.js";
import { type FetchLike, HermesClient, HermesError } from "../src/hermes-client.js";

function makeSettings(overrides: Partial<Settings> = {}): Settings {
  return {
    apiKey: "test-secret",
    defaultSessionId: undefined,
    gatewayUrl: "http://127.0.0.1:8642",
    timeoutMs: 30_000,
    ...overrides,
  };
}

describe("HermesClient", () => {
  it("creates its default session once and reuses it", async () => {
    const paths: string[] = [];
    const fetchMock: FetchLike = async (input, init) => {
      const url = new URL(input.toString());
      paths.push(url.pathname);
      expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer test-secret");
      if (url.pathname === "/api/sessions") {
        return Response.json(
          { object: "hermes.session", session: { id: "api-session-1" } },
          { status: 201 },
        );
      }
      return Response.json({
        message: { content: "Hermes answer", role: "assistant" },
        object: "hermes.session.chat.completion",
        session_id: "api-session-1",
      });
    };
    const client = new HermesClient(makeSettings(), fetchMock);

    const first = await client.ask("first");
    const second = await client.ask("second");

    expect(first.text).toBe("Hermes answer");
    expect(second.sessionId).toBe("api-session-1");
    expect(client.defaultSessionId).toBe("api-session-1");
    expect(paths).toEqual([
      "/api/sessions",
      "/api/sessions/api-session-1/chat",
      "/api/sessions/api-session-1/chat",
    ]);
  });

  it("resumes a stable default session after a create conflict", async () => {
    const requests: Array<[string, string]> = [];
    const fetchMock: FetchLike = async (input, init) => {
      const url = new URL(input.toString());
      const method = init?.method ?? "GET";
      requests.push([method, url.pathname]);
      if (method === "POST" && url.pathname === "/api/sessions") {
        return Response.json({ error: { message: "already exists" } }, { status: 409 });
      }
      if (method === "GET") {
        return Response.json({ session: { id: "mcp-codex" } });
      }
      return Response.json({
        message: { content: "continued", role: "assistant" },
        session_id: "mcp-codex",
      });
    };
    const client = new HermesClient(makeSettings({ defaultSessionId: "mcp-codex" }), fetchMock);

    const reply = await client.ask("continue");

    expect(reply.text).toBe("continued");
    expect(requests).toEqual([
      ["POST", "/api/sessions"],
      ["GET", "/api/sessions/mcp-codex"],
      ["POST", "/api/sessions/mcp-codex/chat"],
    ]);
  });

  it("continues an explicit session without replacing the default", async () => {
    const fetchMock: FetchLike = async (input) => {
      expect(new URL(input.toString()).pathname).toBe("/api/sessions/existing-id/chat");
      return Response.json({
        message: { content: "continued", role: "assistant" },
        session_id: "existing-id",
      });
    };
    const client = new HermesClient(makeSettings(), fetchMock);

    const reply = await client.ask("continue", "existing-id");

    expect(reply.sessionId).toBe("existing-id");
    expect(client.defaultSessionId).toBeUndefined();
  });

  it("fails before network access when the API key is missing", async () => {
    const client = new HermesClient(makeSettings({ apiKey: "" }));

    await expect(client.ask("hello")).rejects.toThrow(HermesError);
    await expect(client.ask("hello")).rejects.toThrow("API key not found");
  });

  it("returns an actionable authentication error", async () => {
    const fetchMock: FetchLike = async () =>
      Response.json({ error: { message: "invalid bearer" } }, { status: 401 });
    const client = new HermesClient(makeSettings(), fetchMock);

    await expect(client.ask("hello", "existing-id")).rejects.toThrow("authentication failed");
  });
});
