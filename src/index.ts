import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import express from 'express';
import cors from 'cors';
import { loadConfig, getConfigPath } from './config';
import { SessionManager } from './services/sessionManager';
import { FormatTranslator } from './services/formatTranslator';
import { ProviderProxy } from './services/providerProxy';
import { createApiKeyAuthMiddleware } from './middleware/apiKeyAuth';
import { createSessionGuardMiddleware } from './middleware/sessionGuard';
import { createCorsMiddleware } from './middleware/cors';
import { createLLMApiRouter } from './routes/llmApi';
import { createAdminApiRouter } from './routes/adminApi';
import { logger } from './utils/logger';

async function main() {
  try {
    const configPath = getConfigPath();
    const config = loadConfig(configPath);

    const sessionManager = new SessionManager(config);
    sessionManager.initialize();

    const translator = new FormatTranslator(config);
    const providerProxy = new ProviderProxy(config, sessionManager, translator);

    const apiKeyAuth = createApiKeyAuthMiddleware(config);
    const sessionGuard = createSessionGuardMiddleware(sessionManager, config.server.uiPort);
    const corsMiddleware = createCorsMiddleware(`http://127.0.0.1:${config.server.uiPort}`);

    const llmApp = express();
    llmApp.use(express.json({ limit: '50mb' }));
    llmApp.use(apiKeyAuth);
    llmApp.use(sessionGuard);
    llmApp.use('/', createLLMApiRouter(providerProxy));

    const adminApp = express();
    adminApp.use(express.json({ limit: '50mb' }));
    adminApp.use(corsMiddleware);
    adminApp.use('/sessions', (req, res, next) => next());
    adminApp.use('/', createAdminApiRouter(sessionManager, config.server.adminApiKey));

    const uiApp = express();
    const uiDir = path.join(__dirname, 'ui');
    uiApp.use(express.static(uiDir));

    const llmServer = llmApp.listen(config.server.llmPort, config.server.host, () => {
      logger.info('LLM API server started', {
        host: config.server.host,
        port: config.server.llmPort,
      });
    });

    const adminServer = adminApp.listen(config.server.adminPort, config.server.host, () => {
      logger.info('Admin API server started', {
        host: config.server.host,
        port: config.server.adminPort,
      });
    });

    const uiServer = uiApp.listen(config.server.uiPort, config.server.host, () => {
      logger.info('UI server started', {
        host: config.server.host,
        port: config.server.uiPort,
      });
    });

    const shutdown = () => {
      logger.info('Shutting down servers...');
      llmServer.close();
      adminServer.close();
      uiServer.close();
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  } catch (error) {
    logger.error('Failed to start LLM Gateway', { error: (error as Error).message, stack: (error as Error).stack });
    process.exit(1);
  }
}

main();
