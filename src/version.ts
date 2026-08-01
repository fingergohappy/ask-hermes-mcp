import { readFileSync } from "node:fs";

/**
 * Replaced with a string literal by scripts/build-bundle.mjs.
 *
 * The published artifacts ship the bundle alone — the RPM installs only
 * ask-hermes-mcp.cjs — so package.json is not resolvable at runtime there and
 * the version has to be baked in at build time. Left undeclared in the tsc
 * build and in tests, where package.json is next to the sources.
 */
declare const __ASK_HERMES_MCP_VERSION__: string | undefined;

export const FALLBACK_VERSION = "0.0.0-dev";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function injectedVersion(): string {
  return typeof __ASK_HERMES_MCP_VERSION__ === "string" ? __ASK_HERMES_MCP_VERSION__ : "";
}

function packageJsonVersion(): string {
  try {
    const document: unknown = JSON.parse(
      readFileSync(new URL("../package.json", import.meta.url), "utf8"),
    );
    if (isRecord(document) && typeof document.version === "string") {
      return document.version;
    }
  } catch {
    return "";
  }
  return "";
}

export function resolveVersion(): string {
  return injectedVersion() || packageJsonVersion() || FALLBACK_VERSION;
}
