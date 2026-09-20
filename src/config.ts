import * as yaml from 'js-yaml';
import * as fs from 'fs';
import * as path from 'path';
import { Config } from './interfaces/config';
import { logger } from './utils/logger';

export function loadConfig(configPath: string): Config {
  const fullPath = path.isAbsolute(configPath) ? configPath : path.join(process.cwd(), configPath);

  if (!fs.existsSync(fullPath)) {
    throw new Error(`Config file not found: ${fullPath}`);
  }

  const fileContent = fs.readFileSync(fullPath, 'utf-8');
  const rawConfig = yaml.load(fileContent) as Record<string, unknown>;

  if (!rawConfig || typeof rawConfig !== 'object') {
    throw new Error('Config file is empty or invalid');
  }

  const server = rawConfig.server as Record<string, unknown>;
  const clients = rawConfig.clients as Record<string, unknown>[];
  const providers = rawConfig.providers as Record<string, Record<string, unknown>>;
  const rawModelRouting = (rawConfig.modelRouting ?? []) as Array<{ name: string; provider: string; model: string }>;
  const sessions = rawConfig.sessions as Record<string, unknown>;

  if (!server) {
    throw new Error('Missing required config section: server');
  }
  if (!clients || !Array.isArray(clients) || clients.length === 0) {
    throw new Error('Missing required config section: clients (must be a non-empty array)');
  }
  if (!providers || typeof providers !== 'object') {
    throw new Error('Missing required config section: providers');
  }

  const resolvedConfig: Config = {
    server: {
      host: resolveEnv(server.host as string, '127.0.0.1'),
      llmPort: Number(resolveEnv(server.llmPort as string, '12000')) || 12000,
      adminPort: Number(resolveEnv(server.adminPort as string, '12001')) || 12001,
      uiPort: Number(resolveEnv(server.uiPort as string, '13000')) || 13000,
      adminApiKey: server.adminApiKey !== undefined ? resolveEnv(server.adminApiKey as string) : undefined,
    },
    clients: clients.map((client, index) => ({
      id: client.id as string,
      apiKey: resolveEnv(client.apiKey as string, `missing-client-key-${index}`),
    })),
    providers: Object.entries(providers).reduce((acc, [name, provider]) => {
      acc[name] = {
        type: (provider.type as 'anthropic' | 'openai') || 'openai',
        apiKey: resolveEnv(provider.apiKey as string, ''),
        baseURL: resolveEnv(provider.baseURL as string, ''),
      };
      return acc;
    }, {} as Record<string, { type: 'anthropic' | 'openai'; apiKey: string; baseURL: string }>),
    modelRouting: Object.fromEntries(
      rawModelRouting.map(({ name, provider, model }) => [name, { provider, model }])
    ),
    sessions: {
      file: (sessions?.file as string) || 'sessions.json',
    },
  };

  for (const [name, provider] of Object.entries(resolvedConfig.providers)) {
    const p = provider as { baseURL: string };
    if (!p.baseURL) {
      throw new Error(`Provider '${name}' is missing baseURL`);
    }
  }

  for (const [name, entry] of Object.entries(resolvedConfig.modelRouting)) {
    if (!resolvedConfig.providers[entry.provider]) {
      throw new Error(`modelRouting rule '${name}' references unknown provider '${entry.provider}'`);
    }
  }

  logger.info('Config loaded', {
    clients: resolvedConfig.clients.length,
    providers: Object.keys(resolvedConfig.providers),
  });

  return resolvedConfig;
}

function resolveEnv(value: string, defaultValue?: string): string {
  if (!value) {
    if (defaultValue !== undefined) {
      return defaultValue;
    }
    throw new Error('Empty value provided to resolveEnv');
  }

  const envVarMatch = value.match(/^\$\{([^}]+)\}$/);
  if (envVarMatch) {
    const raw = envVarMatch[1];
    const parts = raw.split(':');
    const envVarName = parts[0];
    const envDefault = parts.length > 1 ? parts.slice(1).join(':') : undefined;
    const envValue = process.env[envVarName];
    if (envValue !== undefined && envValue !== '') {
      return envValue;
    }
    if (envDefault !== undefined) {
      return envDefault;
    }
    throw new Error(`Environment variable '${envVarName}' is not set or empty`);
  }

  return value;
}

export function getConfigPath(): string {
  return path.join(process.cwd(), 'config', 'config.yaml');
}
