# ask-hermes-mcp

A small TypeScript `stdio` MCP server that lets Codex or Claude Code ask a
running Hermes Agent through its authenticated API Server.

It intentionally exposes one tool:

```text
ask_hermes(prompt, session_id?)
```

- Without `session_id`, one dedicated Hermes session is created and reused for
  the lifetime of the MCP process.
- Each Codex or Claude Code process starts its own MCP process, so the default
  behavior keeps concurrent clients in separate Hermes sessions.
- `ASK_HERMES_DEFAULT_SESSION_ID` can opt a client into a stable session that
  survives MCP process restarts. Do not reuse one stable ID from concurrent
  clients.
- With `session_id`, Hermes continues that existing session. Only target an
  idle session; do not concurrently share a session with a running Hermes CLI.
- The answer returns to the MCP client. It is not automatically delivered to a
  terminal, Telegram, Feishu, or another messaging channel.

## Requirements

- Hermes Agent with its Gateway running
- Hermes API Server enabled on loopback
- Node.js 24 or newer
- pnpm when building from source
- asdf is optional; this repository includes `.tool-versions` for Node.js
  `26.4.0` and pnpm `11.10.0`

Enable the Hermes API Server if it is not already configured:

```bash
hermes config set API_SERVER_HOST 127.0.0.1
hermes config set API_SERVER_ENABLED true
hermes config set API_SERVER_KEY "$(openssl rand -hex 32)"
hermes gateway restart
curl -fsS http://127.0.0.1:8642/health
```

The API Server can run terminal-capable Hermes tools. Keep it bound to
`127.0.0.1` and protect it with a strong key.

## Install

### npm

Register the published package with Codex:

```bash
codex mcp add ask-hermes -- npx --yes ask-hermes-mcp@0.1.0
```

For Claude Code:

```bash
claude mcp add \
  --transport stdio \
  --scope user \
  ask-hermes -- \
  npx --yes ask-hermes-mcp@0.1.0
```

Pinning the package version keeps MCP startup reproducible. Upgrade the version
explicitly when a newer release is available.

### RPM release

RPM packages require Node.js 24 or newer. Download the RPM from the matching
GitHub release, then install and register it:

```bash
sudo dnf install ./ask-hermes-mcp-0.1.0-1.noarch.rpm
codex mcp add ask-hermes -- /usr/bin/ask-hermes-mcp
```

For Claude Code:

```bash
claude mcp add \
  --transport stdio \
  --scope user \
  ask-hermes -- \
  /usr/bin/ask-hermes-mcp
```

### Build from source

After cloning the repository:

```bash
asdf install
pnpm install --frozen-lockfile
pnpm build
```

The bridge discovers `API_SERVER_KEY` in this order:

1. `ASK_HERMES_API_KEY`
2. `API_SERVER_KEY`
3. `API_SERVER_KEY` from `${HERMES_HOME:-~/.hermes}/config.yaml`
4. `API_SERVER_KEY` from `${HERMES_HOME:-~/.hermes}/.env`

Current Hermes versions write the key to `config.yaml`; `.env` remains
supported for older installations. The key is never returned in MCP output, so
it does not need to be copied into this repository or the MCP client config.

## Register with Codex from source

Run this from the repository root:

```bash
codex mcp add ask-hermes -- \
  "$(asdf which node)" \
  "$(realpath dist/index.js)"
```

Verify:

```bash
codex mcp get ask-hermes
codex mcp list
```

Start a new Codex session and use `/mcp` to inspect the connection. Codex
starts the stdio MCP process automatically; do not run `pnpm start` separately.

## Register with Claude Code from source

Run this from the repository root:

```bash
claude mcp add \
  --transport stdio \
  --scope user \
  ask-hermes -- \
  "$(asdf which node)" \
  "$(realpath dist/index.js)"
```

Verify:

```bash
claude mcp get ask-hermes
claude mcp list
```

## Session behavior

By default, each running MCP process creates its own Hermes session on the
first `ask_hermes` call. It reuses that session until the client exits.

For deliberate cross-restart continuity, register a project-specific stable
session:

```bash
codex mcp add \
  --env ASK_HERMES_DEFAULT_SESSION_ID=mcp-codex-my-project \
  ask-hermes -- npx --yes ask-hermes-mcp@0.1.0
```

Do not run multiple clients concurrently with the same stable session ID.
Alternatively, pass `session_id` explicitly on an individual tool call.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `ASK_HERMES_GATEWAY_URL` | `http://127.0.0.1:8642` | Hermes API Server base URL |
| `ASK_HERMES_API_KEY` | auto-discovered | Explicit bearer key override |
| `ASK_HERMES_TIMEOUT_SECONDS` | `1800` | Maximum time for one Hermes turn |
| `ASK_HERMES_DEFAULT_SESSION_ID` | unset | Optional stable default session |
| `HERMES_HOME` | `~/.hermes` | Hermes configuration directory |

To inspect Hermes sessions:

```bash
hermes sessions list
hermes sessions browse
```

Inside an interactive Hermes CLI, `/status` shows that CLI's current session
ID.

## Development

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

To build an RPM locally:

```bash
./scripts/build-rpm.sh 0.1.0
```

The RPM is written to `rpm-dist/`.

## Release

Before publishing npm, validate the source and inspect the package:

```bash
pnpm check
npm pack --dry-run
npm publish
```

The tag release workflow validates the source, builds the same self-contained
JavaScript bundle, packages it as a noarch RPM, creates a GitHub release, and
uploads the RPM plus its SHA-256 checksum. The tag must exactly match the
version in `package.json`:

```bash
git tag v0.1.0
git push origin v0.1.0
```
