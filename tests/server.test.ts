import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it, vi } from "vitest";

import { HermesError } from "../src/hermes-client.js";
import { buildServer, type HermesAsker } from "../src/server.js";

const cleanup: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((close) => close()));
});

async function connectedClient(ask: HermesAsker["ask"]) {
  const server = buildServer({ ask });
  const client = new Client({ name: "test-client", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
  cleanup.push(async () => {
    await client.close();
    await server.close();
  });
  return client;
}

describe("MCP server", () => {
  it("exposes only ask_hermes with a compact schema", async () => {
    const ask = vi.fn(async () => ({ sessionId: "mcp-test", text: "answer" }));
    const client = await connectedClient(ask);

    const result = await client.listTools();

    expect(result.tools.map((tool) => tool.name)).toEqual(["ask_hermes"]);
    expect(result.tools[0]?.inputSchema.required).toEqual(["prompt"]);
    expect(Object.keys(result.tools[0]?.inputSchema.properties ?? {})).toEqual([
      "prompt",
      "session_id",
    ]);
  });

  it("returns only Hermes' answer and forwards an optional session ID", async () => {
    const ask = vi.fn(async () => ({ sessionId: "existing-id", text: "answer" }));
    const client = await connectedClient(ask);

    const result = await client.callTool({
      arguments: { prompt: "question", session_id: "existing-id" },
      name: "ask_hermes",
    });

    expect(ask).toHaveBeenCalledWith("question", "existing-id");
    expect(result.content).toEqual([{ text: "answer", type: "text" }]);
  });

  it("marks bridge failures as MCP tool errors", async () => {
    const ask = vi.fn(async () => {
      throw new HermesError("gateway unavailable");
    });
    const client = await connectedClient(ask);

    const result = await client.callTool({
      arguments: { prompt: "question" },
      name: "ask_hermes",
    });

    expect(result.isError).toBe(true);
    expect(result.content).toEqual([{ text: "gateway unavailable", type: "text" }]);
  });
});
