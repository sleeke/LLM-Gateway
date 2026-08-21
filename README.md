# LLM Gateway

Local web server gateway that routes requests to multiple remote LLM API providers (Anthropic, OpenAI, LM Studio).

## Architecture

```
LLM Gateway (Node.js)
├── LLM API (port 8080) - /v1/messages, /v1/chat/completions, /v1/models
├── Admin API (port 3001) - /sessions, /providers, /health
└── UI Server (port 3000) - Static SPA
```

## Setup

### Prerequisites

- Node.js >= 20
- npm

### Installation

```bash
npm install
```

### Configuration

#### Environment Variables

Create a `.env` file in the project root with the required keys:

```bash
# Admin API key (protects the admin endpoints)
ADMIN_API_KEY=your_admin_key_here

# Client API keys (used by downstream clients to authenticate to the gateway)
CLIENT_KEY_CLAUDE=your_claude_client_key_here
CLIENT_KEY_KILO=your_kilo_client_key_here

# Provider API keys
ANTHROPIC_API_KEY=your_anthropic_key_here
OPENAI_API_KEY=your_openai_key_here
```

#### Config File

Edit `config/config.yaml` to configure servers, clients, providers, and model aliases.

- `server.host` - Bind address (default: `127.0.0.1`)
- `server.llmPort` - LLM API port (default: `8080`)
- `server.adminPort` - Admin API port (default: `3001`)
- `server.uiPort` - UI port (default: `3000`)
- `server.adminApiKey` - Admin API key (resolved from `${ADMIN_API_KEY}`)
- `clients` - Downstream clients with their API keys and assigned providers
- `providers` - LLM provider definitions with API keys and base URLs
- `modelAliases` - Friendly model names mapped to provider-specific model IDs
- `sessions.file` - Path to session persistence file (default: `sessions.json`)

Environment variables in `config.yaml` are resolved at startup using `${VAR_NAME}` syntax. Missing environment variables will cause the server to fail fast.

## Running

```bash
# Development (with auto-reload)
npm run dev

# Build TypeScript
npm run build

# Production
npm start
```

## Access

- LLM API: `http://127.0.0.1:8080`
- Admin API: `http://127.0.0.1:3001`
- UI: `http://127.0.0.1:3000`

## LLM API Endpoints

### POST /v1/messages

Anthropic-format messages endpoint. Automatically translates to OpenAI format if the client's assigned provider is OpenAI-compatible.

### POST /v1/chat/completions

OpenAI-format chat completions endpoint. Automatically translates to Anthropic format if the client's assigned provider is Anthropic.

### GET /v1/models

Proxies model listing from the client's assigned provider.

All LLM API endpoints require a Bearer token matching one of the configured `clients[].apiKey` values.

## Admin API Endpoints

- `GET /health` - Health check (no auth required if `adminApiKey` is unset)
- `GET /sessions` - List all sessions (requires admin API key)
- `POST /sessions/assign-provider` - Assign a provider to a client API key
- `POST /sessions/remove-provider` - Remove provider assignment from a client API key
- `GET /providers` - List configured providers

Admin endpoints are protected by `Authorization: Bearer $ADMIN_API_KEY` when `adminApiKey` is configured.

## Using with Claude Code CLI

Configure Claude Code CLI to use the gateway as its API endpoint:

```bash
export ANTHROPIC_BASE_URL=http://127.0.0.1:8080
export ANTHROPIC_API_KEY=<CLIENT_KEY_CLAUDE from config.yaml>
```

Then run Claude Code CLI normally. It will send requests to `/v1/messages` on the gateway, which will translate and forward them to the assigned provider.

## Using with Other Clients

For OpenAI-compatible clients, point them at the gateway with the appropriate client API key:

```bash
export OPENAI_BASE_URL=http://127.0.0.1:8080
export OPENAI_API_KEY=<CLIENT_KEY_KILO or other configured client key>
```

## Troubleshooting

### {"error":{"message":"Missing or invalid Authorization header","type":"auth_error"}} on port 8080

This means the LLM API did not receive a valid Bearer token.

- Ensure you are sending `Authorization: Bearer <your_client_api_key>` where the key matches one of the values in `clients[].apiKey` in `config/config.yaml`.
- For Claude Code CLI, set `ANTHROPIC_API_KEY` to the `CLIENT_KEY_CLAUDE` value (not your upstream Anthropic key).
- Verify there are no extra spaces or typos in the header value.

### {"error":{"message":"Invalid or missing admin API key","type":"auth_error"}} on port 3001

This means the Admin API request did not include the correct admin Bearer token.

- Ensure you are sending `Authorization: Bearer $ADMIN_API_KEY` where the value matches `server.adminApiKey` in `config/config.yaml`.
- If you have not set `ADMIN_API_KEY` in your `.env`, either set it or remove `adminApiKey` from `config/config.yaml` to disable admin auth.
- Admin endpoints like `/sessions` require this header; `/health` does not.

## Format Translation

The gateway automatically translates between Anthropic and OpenAI request/response formats based on the client's assigned provider, so clients can use their native format regardless of the upstream provider.
