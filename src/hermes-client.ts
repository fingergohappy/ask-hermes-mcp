import type { Settings } from "./config.js";

export class HermesError extends Error {
  override readonly name = "HermesError";
}

export interface HermesReply {
  text: string;
  sessionId: string;
}

export type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export class HermesClient {
  private defaultSessionReady = false;
  private tail: Promise<void> = Promise.resolve();
  private readonly fetchImpl: FetchLike;

  defaultSessionId: string | undefined;

  constructor(
    private readonly settings: Settings,
    fetchImpl: FetchLike = globalThis.fetch.bind(globalThis),
  ) {
    this.fetchImpl = fetchImpl;
    this.defaultSessionId = settings.defaultSessionId;
  }

  ask(prompt: string, sessionId?: string): Promise<HermesReply> {
    const operation = this.tail.then(
      () => this.askLocked(prompt, sessionId),
      () => this.askLocked(prompt, sessionId),
    );
    this.tail = operation.then(
      () => undefined,
      () => undefined,
    );
    return operation;
  }

  private async askLocked(prompt: string, sessionId?: string): Promise<HermesReply> {
    const cleanPrompt = prompt.trim();
    if (!cleanPrompt) {
      throw new HermesError("prompt must not be empty");
    }
    if (sessionId !== undefined && !sessionId.trim()) {
      throw new HermesError("session_id must not be blank");
    }
    if (!this.settings.apiKey) {
      throw new HermesError(
        "Hermes API key not found. Configure API_SERVER_KEY with " +
          "`hermes config set API_SERVER_KEY <key>`.",
      );
    }

    const explicitSessionId = sessionId?.trim();
    const usesDefault = explicitSessionId === undefined;
    const selectedSessionId = explicitSessionId ?? (await this.ensureDefaultSession());
    const reply = await this.chat(selectedSessionId, cleanPrompt);

    if (usesDefault) {
      this.defaultSessionId = reply.sessionId;
      this.defaultSessionReady = true;
    }
    return reply;
  }

  private async ensureDefaultSession(): Promise<string> {
    if (this.defaultSessionReady && this.defaultSessionId) {
      return this.defaultSessionId;
    }

    const desiredId = this.defaultSessionId;
    const response = await this.request("POST", "/api/sessions", this.newSessionBody(desiredId));

    if (response.status === 409 && desiredId) {
      const existing = await this.request("GET", `/api/sessions/${encodeURIComponent(desiredId)}`);
      await this.requireSuccess(existing);
      this.defaultSessionReady = true;
      return desiredId;
    }

    await this.requireSuccess(response);
    const payload = await this.jsonObject(response);
    const session = payload.session;
    const createdId = isRecord(session) ? session.id : undefined;
    if (typeof createdId !== "string" || !createdId) {
      throw new HermesError("Hermes API created a session without returning its ID");
    }

    this.defaultSessionId = createdId;
    this.defaultSessionReady = true;
    return createdId;
  }

  /**
   * Sessions created without a model inherit the gateway's advertised virtual
   * model name ("hermes-agent"), which upstream providers reject with HTTP 404.
   * Pin the configured model so the session resolves to a real one.
   */
  private newSessionBody(desiredId: string | undefined): Record<string, string> {
    const body: Record<string, string> = {};
    if (desiredId) {
      body.id = desiredId;
    }
    if (this.settings.model) {
      body.model = this.settings.model;
    }
    return body;
  }

  private async chat(sessionId: string, prompt: string): Promise<HermesReply> {
    const response = await this.request(
      "POST",
      `/api/sessions/${encodeURIComponent(sessionId)}/chat`,
      { message: prompt },
    );
    await this.requireSuccess(response);
    const payload = await this.jsonObject(response);
    const message = payload.message;
    const content = isRecord(message) ? message.content : undefined;

    let text: string;
    if (typeof content === "string") {
      text = content;
    } else if (content !== undefined) {
      text = JSON.stringify(content);
    } else {
      throw new HermesError("Hermes API response did not contain an assistant message");
    }

    const responseSessionId =
      typeof payload.session_id === "string"
        ? payload.session_id
        : response.headers.get("X-Hermes-Session-Id");
    return {
      text,
      sessionId: responseSessionId || sessionId,
    };
  }

  private async request(method: string, path: string, body?: unknown): Promise<Response> {
    const headers = new Headers({
      Accept: "application/json",
      Authorization: `Bearer ${this.settings.apiKey}`,
      "User-Agent": "ask-hermes-mcp/0.1.0",
    });
    const init: RequestInit = {
      method,
      headers,
      signal: AbortSignal.timeout(this.settings.timeoutMs),
    };
    if (body !== undefined) {
      headers.set("Content-Type", "application/json");
      init.body = JSON.stringify(body);
    }

    try {
      return await this.fetchImpl(new URL(path, `${this.settings.gatewayUrl}/`), init);
    } catch (error) {
      if (
        error instanceof DOMException &&
        (error.name === "AbortError" || error.name === "TimeoutError")
      ) {
        throw new HermesError(
          `Hermes did not finish within ${this.settings.timeoutMs / 1000} seconds`,
        );
      }
      throw new HermesError(
        `Cannot connect to Hermes API Server at ${this.settings.gatewayUrl}. ` +
          "Enable API_SERVER_ENABLED and restart the Hermes Gateway.",
      );
    }
  }

  private async jsonObject(response: Response): Promise<Record<string, unknown>> {
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new HermesError("Hermes API returned invalid JSON");
    }
    if (!isRecord(payload)) {
      throw new HermesError("Hermes API returned an unexpected JSON value");
    }
    return payload;
  }

  private async requireSuccess(response: Response): Promise<void> {
    if (response.ok) {
      return;
    }
    const detail = await this.errorDetail(response);
    const suffix = detail ? `: ${detail}` : "";
    if (response.status === 401 || response.status === 403) {
      throw new HermesError(`Hermes API authentication failed. Check API_SERVER_KEY${suffix}`);
    }
    if (response.status === 404) {
      throw new HermesError(`Hermes session or API endpoint was not found${suffix}`);
    }
    throw new HermesError(`Hermes API request failed with HTTP ${response.status}${suffix}`);
  }

  private async errorDetail(response: Response): Promise<string> {
    try {
      const payload: unknown = await response.clone().json();
      if (!isRecord(payload)) {
        return "";
      }
      const error = payload.error;
      if (isRecord(error) && error.message) {
        return String(error.message).slice(0, 500);
      }
      return typeof error === "string" ? error.slice(0, 500) : "";
    } catch {
      try {
        return (await response.text()).trim().slice(0, 500);
      } catch {
        return "";
      }
    }
  }
}
