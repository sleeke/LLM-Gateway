# LLM Gateway - Project Instructions

## Overview

This is a local TypeScript/Node.js web server that acts as a gateway to multiple remote LLM API providers (Anthropic, OpenAI, LM Studio). Clients (Claude CLI, Kilo, etc.) route all requests through this gateway.

## Architecture

```
LLM Gateway (Node.js)
├── LLM API (port 8080) - /v1/messages, /v1/chat/completions, /v1/models
├── Admin API (port 3001) - /sessions, /providers, /health
└── UI Server (port 3000) - Static SPA
```

## Key Conventions

1. **TypeScript strict mode** is enabled. All code must pass `npm run lint` (tsc --noEmit).
2. **No frontend framework** - UI uses vanilla HTML/CSS/JS only.
3. **Session persistence** - `sessions.json` stores runtime state and is gitignored.
4. **Config-driven** - Provider configs are in `config/config.yaml`. Env vars must be resolved at startup.
5. **Format translation** is first-class - both request and response translation including streaming.
6. **Fail fast** - Missing env vars or invalid config must throw at startup.

## File Structure

- `src/config.ts` - Config loader
- `src/services/sessionManager.ts` - Session state CRUD
- `src/services/formatTranslator.ts` - Anthropic ↔ OpenAI translation
- `src/services/providerProxy.ts` - Forward requests to providers
- `src/middleware/` - API key auth, session guard, CORS
- `src/routes/` - LLM API and Admin API routes
- `src/ui/` - Static SPA files
- `src/utils/logger.ts` - Logging utility

## Running

```bash
# Development
npm run dev

# Build
npm run build

# Start production
npm start
```

## Testing

Test with curl:
```bash
# Health check
curl http://127.0.0.1:12001/health

# List sessions (requires admin API key)
curl -H "Authorization: Bearer $ADMIN_API_KEY" http://127.0.0.1:12001/sessions
```

## Security

- Gateway API keys are defined in config.yaml as env var references.
- Provider API keys are never exposed to clients.
- Admin API is on a separate port with optional admin API key protection.
- `sessions.json` is gitignored.
