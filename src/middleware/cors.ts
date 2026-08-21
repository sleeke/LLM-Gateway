import { Request, Response, NextFunction } from 'express';
import cors from 'cors';

export function createCorsMiddleware(uiOrigin: string) {
  return cors({
    origin: uiOrigin,
    credentials: true,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });
}
