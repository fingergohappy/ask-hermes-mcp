import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import * as z from "zod/v4";

import { loadSettings } from "./config.js";
import { HermesClient, HermesError, type HermesReply } from "./hermes-client.js";
import { resolveVersion } from "./version.js";

export interface HermesAsker {
  ask(prompt: string, sessionId?: string): Promise<HermesReply>;
}

export function buildServer(hermes: HermesAsker = new HermesClient(loadSettings())): McpServer {
  const server = new McpServer({
    name: "ask-hermes-mcp",
    version: resolveVersion(),
  });

  server.registerTool(
    "ask_hermes",
    {
      description: "Ask the local Hermes Agent; optionally continue an idle session.",
      inputSchema: {
        prompt: z.string().trim().min(1),
        session_id: z.string().trim().min(1).optional(),
      },
    },
    async ({ prompt, session_id }) => {
      try {
        const reply = await hermes.ask(prompt, session_id);
        return {
          content: [{ type: "text", text: reply.text }],
        };
      } catch (error) {
        const message =
          error instanceof HermesError || error instanceof Error
            ? error.message
            : "Unexpected Hermes bridge error";
        return {
          content: [{ type: "text", text: message }],
          isError: true,
        };
      }
    },
  );

  return server;
}

export async function runServer(): Promise<void> {
  const server = buildServer();
  await server.connect(new StdioServerTransport());
}
