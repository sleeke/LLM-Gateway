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
  const modelAliases = rawConfig.modelAliases as Record<string, Record<string, string>>;
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
      llmPort: Number(server.llmPort) || 8080,
      adminPort: Number(server.adminPort) || 3001,
      uiPort: Number(server.uiPort) || 3000,
      adminApiKey: server.adminApiKey !== undefined ? resolveEnv(server.adminApiKey as string) : undefined,
    },
    clients: clients.map((client, index) => ({
      id: client.id as string,
      apiKey: resolveEnv(client.apiKey as string, `missing-client-key-${index}`),
      provider: client.provider as string | undefined,
    })),
    providers: Object.entries(providers).reduce((acc, [name, provider]) => {
      acc[name] = {
        type: (provider.type as 'anthropic' | 'openai') || 'openai',
        apiKey: resolveEnv(provider.apiKey as string, ''),
        baseURL: resolveEnv(provider.baseURL as string, ''),
      };
      return acc;
    }, {} as Record<string, { type: 'anthropic' | 'openai'; apiKey: string; baseURL: string }>),
    modelAliases: modelAliases || {},
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
    const envVarName = envVarMatch[1];
    const envValue = process.env[envVarName];
    if (envValue === undefined || envValue === '') {
      throw new Error(`Environment variable '${envVarName}' is not set or empty`);
    }
    return envValue;
  }

  return value;
}

export function getConfigPath(): string {
  return path.join(process.cwd(), 'config', 'config.yaml');
}
