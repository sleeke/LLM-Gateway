import { Request, Response, NextFunction } from 'express';
import { SessionManager } from '../services/sessionManager';
import { AuthenticatedRequest } from './apiKeyAuth';
import { logger } from '../utils/logger';

export function createSessionGuardMiddleware(sessionManager: SessionManager, uiPort: number) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.session) {
      res.status(401).json({
        error: {
          message: 'Unauthorized',
          type: 'auth_error',
        },
      });
      return;
    }

    const provider = sessionManager.getProviderForApiKey(req.session.apiKey);

    if (provider === null) {
      const uiUrl = `http://127.0.0.1:${uiPort}`;
      logger.warn('Session guard blocked unassigned session', {
        clientId: req.session.clientId,
      });
      res.status(403).json({
        error: {
          message: `No provider selected for this session. Please select a provider at ${uiUrl}`,
          type: 'session_error',
          providerUrl: uiUrl,
        },
      });
      return;
    }

    req.provider = {
      name: provider,
      config: undefined,
    };

    next();
  };
}
