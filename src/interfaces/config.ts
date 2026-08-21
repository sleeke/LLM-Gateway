export interface ProviderConfig {
  type: 'anthropic' | 'openai';
  apiKey: string;
  baseURL: string;
}

export interface ClientConfig {
  id: string;
  apiKey: string;
  provider?: string;
}

export interface ModelAliasMap {
  [provider: string]: {
    [alias: string]: string;
  };
}

export interface ServerConfig {
  host: string;
  llmPort: number;
  adminPort: number;
  uiPort: number;
  adminApiKey?: string;
}

export interface SessionsConfig {
  file: string;
}

export interface Config {
  server: ServerConfig;
  clients: ClientConfig[];
  providers: Record<string, ProviderConfig>;
  modelAliases: ModelAliasMap;
  sessions: SessionsConfig;
}
