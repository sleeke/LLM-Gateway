# LLM Gateway

Local web server gateway that routes requests to multiple remote LLM API providers (Anthropic, OpenAI, LM Studio, OpenRouter).

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

### Environment Variables

Create a `.env` file in the project root. The server fails fast if required variables are missing.

```bash
# Admin API key (protects admin endpoints)
ADMIN_API_KEY=your_admin_key_here

# Client API keys (used by downstream clients to authenticate to the gateway)
CLIENT_KEY_CLAUDE=your_claude_client_key_here
CLIENT_KEY_KILO=your_kilo_client_key_here

# Provider API keys
ANTHROPIC_API_KEY=your_anthropic_key_here
OPENAI_API_KEY=your_openai_key_here
OPEN_ROUTER_API_KEY=your_openrouter_key_here
```

### Config File

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

Environment variables in `config.yaml` are resolved at startup using `${VAR_NAME}` syntax.

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

## Usage

### LLM API Endpoints

All LLM API endpoints require a Bearer token matching one of the configured `clients[].apiKey` values.

#### POST /v1/messages

Anthropic-format messages endpoint. If the client's assigned provider is OpenAI-compatible, the gateway translates the request body and forwards it to `/v1/chat/completions`.

#### POST /v1/chat/completions

OpenAI-format chat completions endpoint. If the client's assigned provider is Anthropic, the gateway translates the request body and forwards it to `/v1/messages`.

#### GET /v1/models

Proxies model listing from the client's assigned provider.

### Admin API Endpoints

- `GET /health` - Health check (no auth required if `adminApiKey` is unset)
- `GET /sessions` - List all sessions (requires admin API key)
- `POST /sessions/assign-provider` - Assign a provider to a client API key
- `POST /sessions/remove-provider` - Remove provider assignment from a client API key
- `GET /providers` - List configured providers

Admin endpoints are protected by `Authorization: Bearer $ADMIN_API_KEY` when `adminApiKey` is configured.

### Claude Code CLI

Configure Claude Code CLI to use the gateway as its API endpoint:

```bash
export ANTHROPIC_BASE_URL=http://127.0.0.1:8080
export ANTHROPIC_API_KEY=<CLIENT_KEY_CLAUDE from config.yaml>
```

Then run Claude Code CLI normally. It will send requests to `/v1/messages` on the gateway, which will translate and forward them to the assigned provider.

Use `/model` in Claude Code to select a model. If you have configured model aliases, you can use the friendly name (e.g., `/model free`).

### Other Clients

For OpenAI-compatible clients, point them at the gateway with the appropriate client API key:

```bash
export OPENAI_BASE_URL=http://127.0.0.1:8080
export OPENAI_API_KEY=<CLIENT_KEY_KILO or other configured client key>
```

### Model Aliases

Map friendly model names to provider-specific model IDs in `config/config.yaml`:

```yaml
modelAliases:
  anthropic:
    claude-3-5-sonnet-latest: claude-3-5-sonnet-20241022
  openai:
    gpt-4: gpt-4
  openrouter:
    free: openrouter/free
  lmstudio:
    llama-3-8b: llama-3-8b-instruct-q4_K_M
```

The alias section must match the provider name assigned to the client.

### Format Translation

The gateway automatically translates between Anthropic and OpenAI request/response formats based on the client's assigned provider, so clients can use their native format regardless of the upstream provider.

When translating between formats, the gateway also maps the endpoint path:
- Anthropic client → OpenAI provider: sends to `/v1/chat/completions`
- OpenAI client → Anthropic provider: sends to `/v1/messages`

### Provider Assignment

You can set which provider a client uses in two ways:

**1. Statically in `config/config.yaml`**
```yaml
clients:
  - id: claude-cli
    apiKey: ${CLIENT_KEY_CLAUDE}
    provider: anthropic
```

**2. Dynamically at runtime**
Use the Admin API or the UI at `http://127.0.0.1:3000`:
- **Admin API**: `POST /sessions/assign-provider` with body `{ "apiKey": "<CLIENT_KEY_CLAUDE>", "provider": "openrouter" }`
- **UI**: Select a provider from the dropdown next to the session and click **Save**

Runtime assignments are persisted to `sessions.json` and override the config file value. Note that `sessions.json` is gitignored.

## Logging

Logs are written to `logs/gateway.log` with automatic rotation. The log rotates when it reaches 5MB, keeping up to 5 historical files (`gateway.log.1` through `gateway.log.5`).

The terminal output mirrors the log file. If provider responses are large, they may be truncated in the terminal but will be written fully to the log file.

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

### Error: Failed to fetch

This generic error usually means a client or the UI could not reach a backend endpoint.

- **For Claude Code CLI or other LLM clients**: Check that the gateway is running and the `BASE_URL` points to the gateway (e.g., `http://127.0.0.1:8080`). Verify the client API key is correct and the client's provider assignment is set.
- **For the Admin UI**: Ensure the gateway is running and ports `3000`/`3001` are not blocked. If `adminApiKey` is configured, enter it in the UI when prompted.
- **For the gateway itself**: If `/v1/models` or upstream provider calls fail, verify the provider `baseURL` and `apiKey` in `config/config.yaml` are correct and reachable from the machine running the gateway.

### Provider returns HTML error pages (404/401 with `x-powered-by: Express`)

If the upstream provider returns an HTML page instead of JSON, check the following:

- **Wrong provider type**: OpenRouter and other OpenAI-compatible providers must use `type: openai`, not `type: anthropic`.
- **Wrong baseURL**: The `baseURL` must include the full API path prefix. For OpenRouter, use `baseURL: https://openrouter.ai/api`. The gateway concatenates the endpoint path (`/v1/chat/completions`) to this value, so an incorrect baseURL will produce an invalid request URL.
- **Missing provider API key**: Verify the provider's `apiKey` is set in `.env` and resolved correctly in `config.yaml`.
- **Model availability**: Some models (especially free ones) may be temporarily unavailable. Check `logs/gateway.log` for the exact request URL and response body. The full error body is logged there.

### Model not found errors

If a model is reported as unavailable:

- Ensure the model alias is defined under the correct provider in `modelAliases`.
- Check that the upstream provider actually supports the model ID. Model availability changes frequently, especially for free models.
- Try a known working model directly (e.g., `/model meta-llama/llama-3.1-8b-instruct:free` on OpenRouter) to isolate whether the issue is with the gateway or the provider.
- Check `logs/gateway.log` to confirm the exact model name being forwarded.
