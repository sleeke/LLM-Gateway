# LLM Gateway

A local TypeScript/Node.js web server that acts as a gateway to multiple remote LLM API providers (Anthropic, OpenAI, LM Studio). Clients (Claude CLI, Kilo, etc.) route all requests through this gateway.

## Features

- **Multi-provider support**: Anthropic, OpenAI, LM Studio
- **Format translation**: Bidirectional translation between Anthropic and OpenAI formats, including streaming
- **Session management**: Intentional provider selection per API key via web UI
- **Streaming support**: SSE (Anthropic) and NDJSON (OpenAI) stream translation
- **Model aliases**: Configurable model name mapping per provider
- **Admin API**: Separate port for session management and health checks
- **Web UI**: Lightweight single-page application for managing sessions

## Quick Start

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Configure environment**:
   ```bash
   cp .env.example .env
   # Edit .env with your API keys
   ```

3. **Configure providers**:
   Edit `config/config.yaml` to match your provider setup.

4. **Build and run**:
   ```bash
   npm run build
   npm start
   ```

5. **Open the UI**:
   Navigate to `http://127.0.0.1:3000` to select providers for your API keys.

## Configuration

### config/config.yaml

```yaml
server:
  host: 127.0.0.1
  llmPort: 8080
  adminPort: 3001
  uiPort: 3000
  adminApiKey: ${ADMIN_API_KEY}

clients:
  - id: claude-cli
    apiKey: ${CLIENT_KEY_CLAUDE}
    provider: anthropic  # optional; omit for manual selection
  - id: kilo
    apiKey: ${CLIENT_KEY_KILO}
    provider: openai     # optional; omit for manual selection

providers:
  anthropic:
    type: anthropic
    apiKey: ${ANTHROPIC_API_KEY}
    baseURL: https://api.anthropic.com/v1
  openai:
    type: openai
    apiKey: ${OPENAI_API_KEY}
    baseURL: https://api.openai.com/v1
  lmstudio:
    type: openai
    apiKey: ""
    baseURL: http://localhost:1234/v1

modelAliases:
  anthropic:
    claude-3-5-sonnet-latest: claude-3-5-sonnet-20241022
  openai:
    gpt-4: gpt-4
  lmstudio:
    llama-3-8b: llama-3-8b-instruct-q4_K_M

sessions:
  file: sessions.json
```

### .env

```
ADMIN_API_KEY=sk-admin-<random>
CLIENT_KEY_CLAUDE=sk-claude-<random>
CLIENT_KEY_KILO=sk-kilo-<random>
ANTHROPIC_API_KEY=sk-ant-<your-key>
OPENAI_API_KEY=sk-<your-key>
```

## Ports

| Service | Port | Purpose |
|---------|------|---------|
| LLM API | 8080 | Proxy requests to LLM providers |
| Admin API | 3001 | Session management, health checks |
| UI | 3000 | Web interface for provider selection |

## API Endpoints

### LLM API (port 8080)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/v1/messages` | POST | Anthropic format handler |
| `/v1/chat/completions` | POST | OpenAI format handler |
| `/v1/models` | GET | Proxy to provider models |

### Admin API (port 3001)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Service health check |
| `/sessions` | GET | List all sessions |
| `/sessions/assign-provider` | POST | Assign provider to API key |
| `/sessions/remove-provider` | POST | Remove provider assignment |
| `/providers` | GET | List configured providers |

## Session Flow

1. Client sends request with API key
2. Gateway validates key (401 if invalid)
3. Session guard checks provider assignment (403 if unassigned)
4. Format translator converts request if needed
5. Provider proxy forwards to provider
6. Response is translated back and returned

## Development

```bash
npm run dev  # Start with auto-reload
npm run lint # Type check
npm run build # Compile TypeScript
```

## License

MIT
