import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { DEFAULT_GATEWAY_URL, loadSettings } from "../src/config.js";

function withHermesHome(run: (home: string) => void): void {
  const home = mkdtempSync(join(tmpdir(), "ask-hermes-config-"));
  try {
    run(home);
  } finally {
    rmSync(home, { force: true, recursive: true });
  }
}

describe("loadSettings", () => {
  it("reads the Hermes API key from config.yaml", () => {
    withHermesHome((home) => {
      writeFileSync(
        join(home, "config.yaml"),
        "API_SERVER_ENABLED: true\nAPI_SERVER_KEY: gateway-secret\n",
      );

      const settings = loadSettings({}, home);

      expect(settings.apiKey).toBe("gateway-secret");
      expect(settings.gatewayUrl).toBe(DEFAULT_GATEWAY_URL);
    });
  });

  it("prefers explicit MCP environment values", () => {
    withHermesHome((home) => {
      writeFileSync(join(home, "config.yaml"), "API_SERVER_KEY: config-secret\n");
      writeFileSync(join(home, ".env"), "API_SERVER_KEY=dotenv-secret\n");

      const settings = loadSettings(
        {
          ASK_HERMES_API_KEY: "explicit-secret",
          ASK_HERMES_GATEWAY_URL: "http://localhost:9999/",
          ASK_HERMES_TIMEOUT_SECONDS: "42",
          ASK_HERMES_DEFAULT_SESSION_ID: "mcp-codex",
          ASK_HERMES_MODEL: "explicit-model",
        },
        home,
      );

      expect(settings).toEqual({
        apiKey: "explicit-secret",
        defaultSessionId: "mcp-codex",
        gatewayUrl: "http://localhost:9999",
        model: "explicit-model",
        timeoutMs: 42_000,
      });
    });
  });

  it("uses .env as a fallback for older Hermes installations", () => {
    withHermesHome((home) => {
      writeFileSync(join(home, ".env"), "API_SERVER_KEY='dotenv-secret'\n");

      expect(loadSettings({}, home).apiKey).toBe("dotenv-secret");
    });
  });

  it("falls back to .env when config.yaml is malformed", () => {
    withHermesHome((home) => {
      writeFileSync(join(home, "config.yaml"), "API_SERVER_KEY: [unterminated\n");
      writeFileSync(join(home, ".env"), "API_SERVER_KEY=dotenv-secret\n");

      expect(loadSettings({}, home).apiKey).toBe("dotenv-secret");
    });
  });

  it("reads the chat model from config.yaml", () => {
    withHermesHome((home) => {
      writeFileSync(
        join(home, "config.yaml"),
        "API_SERVER_KEY: gateway-secret\nmodel:\n  default: grok-4.5\n  provider: xai-oauth\n",
      );

      expect(loadSettings({}, home).model).toBe("grok-4.5");
    });
  });

  it("leaves the model unset when config.yaml has no model.default", () => {
    withHermesHome((home) => {
      writeFileSync(join(home, "config.yaml"), "API_SERVER_KEY: gateway-secret\n");

      expect(loadSettings({}, home).model).toBeUndefined();
    });
  });

  it("prefers ASK_HERMES_MODEL over config.yaml", () => {
    withHermesHome((home) => {
      writeFileSync(
        join(home, "config.yaml"),
        "API_SERVER_KEY: gateway-secret\nmodel:\n  default: grok-4.5\n",
      );

      expect(loadSettings({ ASK_HERMES_MODEL: "grok-4.5-fast" }, home).model).toBe("grok-4.5-fast");
    });
  });

  it("honors HERMES_HOME when no explicit path is supplied", () => {
    withHermesHome((home) => {
      writeFileSync(join(home, "config.yaml"), 'API_SERVER_KEY: "home-secret"\n');

      expect(loadSettings({ HERMES_HOME: home }).apiKey).toBe("home-secret");
    });
  });
});
