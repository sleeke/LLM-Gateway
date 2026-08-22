import { Router, Request, Response } from 'express';
import { SessionManager } from '../services/sessionManager';
import { AuthenticatedRequest } from '../middleware/apiKeyAuth';
import { logger } from '../utils/logger';

export function createAdminApiRouter(sessionManager: SessionManager, adminApiKey?: string): Router {
  const router = Router();

  if (adminApiKey) {
    router.use((req: AuthenticatedRequest, res: Response, next) => {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith(`Bearer ${adminApiKey}`)) {
        res.status(401).json({
          error: {
            message: 'Invalid or missing admin API key',
            type: 'auth_error',
          },
        });
        return;
      }
      next();
    });
  }

  router.get('/health', (req: Request, res: Response) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  router.get('/sessions', (req: AuthenticatedRequest, res: Response) => {
    const sessions = sessionManager.getAllSessions();
    res.json({
      sessions: sessions.map((s) => ({
        clientId: s.clientId,
        apiKey: s.apiKey.substring(0, 8) + '...',
        updatedAt: s.updatedAt,
      })),
    });
  });

  router.get('/providers', (req: AuthenticatedRequest, res: Response) => {
    const providers = sessionManager.getAllSessions();
    const result: Record<string, { type: string; baseURL: string }> = {};
    const config = (sessionManager as any)['config'];
    for (const [name, prov] of Object.entries(config.providers)) {
      result[name] = {
        type: (prov as any).type,
        baseURL: (prov as any).baseURL,
      };
    }
    res.json({ providers: result });
  });

  return router;
}
