#!/usr/bin/env node

import { chmod } from "node:fs/promises";

import { build } from "esbuild";

const outputPath = "dist/ask-hermes-mcp.cjs";

await build({
  entryPoints: ["src/index.ts"],
  bundle: true,
  platform: "node",
  target: "node24",
  format: "cjs",
  outfile: outputPath,
  legalComments: "eof",
});

await chmod(outputPath, 0o755);
