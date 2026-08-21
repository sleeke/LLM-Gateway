import * as fs from 'fs';
import * as path from 'path';
import { Config } from '../interfaces/config';
import { Session } from '../interfaces/formats';
import { logger } from '../utils/logger';

export class SessionManager {
  private sessions: Map<string, Session> = new Map();
  private sessionsFile: string;
  private clientMap: Map<string, { id: string; apiKey: string; provider?: string }> = new Map();

  constructor(private config: Config) {
    this.sessionsFile = path.isAbsolute(config.sessions.file)
      ? config.sessions.file
      : path.join(process.cwd(), config.sessions.file);
  }

  initialize(): void {
    for (const client of this.config.clients) {
      this.clientMap.set(client.apiKey, client);
    }
    this.loadSessions();
    this.persistSessions();
    logger.info('Session manager initialized', {
      totalClients: this.clientMap.size,
      totalSessions: this.sessions.size,
    });
  }

  loadSessions(): void {
    try {
      if (fs.existsSync(this.sessionsFile)) {
        const content = fs.readFileSync(this.sessionsFile, 'utf-8');
        const data = JSON.parse(content) as Record<string, Session>;
        for (const [apiKey, session] of Object.entries(data)) {
          this.sessions.set(apiKey, session);
        }
        logger.info('Sessions loaded from file', { count: this.sessions.size });
      } else {
        logger.info('Sessions file does not exist, starting fresh');
      }

      for (const client of this.config.clients) {
        if (!this.sessions.has(client.apiKey)) {
          this.sessions.set(client.apiKey, {
            provider: client.provider || null,
            updatedAt: new Date().toISOString(),
            clientId: client.id,
          });
        }
      }
    } catch (error) {
      logger.error('Failed to load sessions', { error: (error as Error).message });
      throw error;
    }
  }

  persistSessions(): void {
    try {
      const data: Record<string, Session> = {};
      for (const [apiKey, session] of this.sessions.entries()) {
        data[apiKey] = session;
      }
      fs.writeFileSync(this.sessionsFile, JSON.stringify(data, null, 2), 'utf-8');
    } catch (error) {
      logger.error('Failed to persist sessions', { error: (error as Error).message });
      throw error;
    }
  }

  getProviderForApiKey(apiKey: string): string | null {
    const session = this.sessions.get(apiKey);
    return session ? session.provider : null;
  }

  setProviderForApiKey(apiKey: string, provider: string): void {
    if (!this.clientMap.has(apiKey)) {
      throw new Error('Unknown API key');
    }
    this.sessions.set(apiKey, {
      provider,
      updatedAt: new Date().toISOString(),
      clientId: this.clientMap.get(apiKey)!.id,
    });
    this.persistSessions();
    logger.info('Provider assigned', { clientId: this.clientMap.get(apiKey)!.id, provider });
  }

  removeProviderForApiKey(apiKey: string): void {
    if (!this.clientMap.has(apiKey)) {
      throw new Error('Unknown API key');
    }
    this.sessions.set(apiKey, {
      provider: null,
      updatedAt: new Date().toISOString(),
      clientId: this.clientMap.get(apiKey)!.id,
    });
    this.persistSessions();
    logger.info('Provider removed', { clientId: this.clientMap.get(apiKey)!.id });
  }

  getAllSessions(): Array<{
    apiKey: string;
    clientId: string;
    provider: string | null;
    updatedAt: string;
  }> {
    const result: Array<{
      apiKey: string;
      clientId: string;
      provider: string | null;
      updatedAt: string;
    }> = [];

    for (const client of this.config.clients) {
      const session = this.sessions.get(client.apiKey) || {
        provider: client.provider || null,
        updatedAt: new Date().toISOString(),
        clientId: client.id,
      };
      result.push({
        apiKey: client.apiKey,
        clientId: client.id,
        provider: session.provider,
        updatedAt: session.updatedAt,
      });
    }

    return result;
  }
}
