import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { parse } from "yaml";

export const DEFAULT_GATEWAY_URL = "http://127.0.0.1:8642";
export const DEFAULT_TIMEOUT_MS = 1_800_000;

export interface Settings {
  gatewayUrl: string;
  apiKey: string;
  timeoutMs: number;
  defaultSessionId: string | undefined;
}

type Environment = Readonly<Record<string, string | undefined>>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readDotenv(path: string): Record<string, string> {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    return {};
  }

  const values: Record<string, string> = {};
  for (const rawLine of text.split(/\r?\n/u)) {
    let line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }
    if (line.startsWith("export ")) {
      line = line.slice(7).trimStart();
    }

    const separator = line.indexOf("=");
    if (separator <= 0) {
      continue;
    }
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    const first = value.at(0);
    const last = value.at(-1);
    if (value.length >= 2 && first === last && (first === "'" || first === '"')) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

function readYamlApiKey(path: string): string {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    return "";
  }

  try {
    const document: unknown = parse(text);
    if (!isRecord(document)) {
      return "";
    }
    const value = document.API_SERVER_KEY;
    return typeof value === "string" ? value : "";
  } catch {
    return "";
  }
}

function firstNonempty(...values: Array<string | undefined>): string {
  for (const value of values) {
    if (value?.trim()) {
      return value.trim();
    }
  }
  return "";
}

function parseTimeoutMs(value: string | undefined): number {
  if (!value?.trim()) {
    return DEFAULT_TIMEOUT_MS;
  }
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) {
    throw new Error("ASK_HERMES_TIMEOUT_SECONDS must be a positive number");
  }
  return seconds * 1000;
}

export function loadSettings(
  environment: Environment = process.env,
  hermesHome?: string,
): Settings {
  const configuredHermesHome = firstNonempty(environment.HERMES_HOME);
  const resolvedHermesHome = hermesHome ?? (configuredHermesHome || join(homedir(), ".hermes"));
  const hermesConfigApiKey = readYamlApiKey(join(resolvedHermesHome, "config.yaml"));
  const hermesEnvironment = readDotenv(join(resolvedHermesHome, ".env"));
  const gatewayUrl = firstNonempty(environment.ASK_HERMES_GATEWAY_URL, DEFAULT_GATEWAY_URL).replace(
    /\/+$/u,
    "",
  );

  return {
    gatewayUrl,
    apiKey: firstNonempty(
      environment.ASK_HERMES_API_KEY,
      environment.API_SERVER_KEY,
      hermesConfigApiKey,
      hermesEnvironment.API_SERVER_KEY,
    ),
    timeoutMs: parseTimeoutMs(environment.ASK_HERMES_TIMEOUT_SECONDS),
    defaultSessionId: firstNonempty(environment.ASK_HERMES_DEFAULT_SESSION_ID) || undefined,
  };
}
