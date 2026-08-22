export interface ProviderConfig {
  type: 'anthropic' | 'openai';
  apiKey: string;
  baseURL: string;
}

export interface ClientConfig {
  id: string;
  apiKey: string;
}

export interface ModelRoutingEntry {
  provider: string;
  model: string;
}

export type ModelRoutingMap = Record<string, ModelRoutingEntry>;

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
  modelRouting: ModelRoutingMap;
  sessions: SessionsConfig;
}
