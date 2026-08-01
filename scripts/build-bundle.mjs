#!/usr/bin/env node

import { chmod, readFile } from "node:fs/promises";

import { build } from "esbuild";

const outputPath = "dist/ask-hermes-mcp.cjs";

const { version } = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
if (typeof version !== "string" || !version) {
  throw new Error("package.json is missing a version");
}

await build({
  entryPoints: ["src/index.ts"],
  bundle: true,
  platform: "node",
  target: "node24",
  format: "cjs",
  outfile: outputPath,
  legalComments: "eof",
  // The published bundle and the RPM ship without package.json, so the version
  // reported over the MCP handshake has to be baked in here.
  define: { __ASK_HERMES_MCP_VERSION__: JSON.stringify(version) },
});

await chmod(outputPath, 0o755);
