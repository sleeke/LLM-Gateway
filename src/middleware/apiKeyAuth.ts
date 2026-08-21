import { Request, Response, NextFunction } from 'express';
import { Config } from '../interfaces/config';
import { logger } from '../utils/logger';

export interface AuthenticatedRequest extends Request {
  session?: {
    clientId: string;
    apiKey: string;
  };
  provider?: {
    name: string;
    config?: any;
  };
}

export function createApiKeyAuthMiddleware(config: Config) {
  const validKeys = new Map(
    config.clients.map((client) => [client.apiKey, client.id])
  );

  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      logger.warn('Missing or invalid Authorization header');
      res.status(401).json({
        error: {
          message: 'Missing or invalid Authorization header',
          type: 'auth_error',
        },
      });
      return;
    }

    const apiKey = authHeader.substring(7);

    if (!validKeys.has(apiKey)) {
      logger.warn('Invalid API key', { apiKeyPrefix: apiKey.substring(0, 8) + '...' });
      res.status(401).json({
        error: {
          message: 'Invalid API key',
          type: 'auth_error',
        },
      });
      return;
    }

    req.session = {
      clientId: validKeys.get(apiKey)!,
      apiKey,
    };

    logger.info('API key authenticated', { clientId: req.session.clientId });
    next();
  };
}
