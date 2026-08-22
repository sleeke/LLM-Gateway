import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from './apiKeyAuth';

export function createSessionGuardMiddleware() {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.session) {
      res.status(401).json({ error: { message: 'Unauthorized', type: 'auth_error' } });
      return;
    }
    next();
  };
}
