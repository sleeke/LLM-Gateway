import { Router, Response } from 'express';
import { AuthenticatedRequest } from '../middleware/apiKeyAuth';
import { ProviderProxy } from '../services/providerProxy';
import { Config } from '../interfaces/config';
import { logger } from '../utils/logger';

export function createLLMApiRouter(providerProxy: ProviderProxy, config: Config): Router {
  const router = Router();

  function resolveModel(req: AuthenticatedRequest, res: Response): boolean {
    const modelName = req.body?.model as string | undefined;
    if (!modelName) {
      res.status(400).json({ error: { message: 'Missing required field: model', type: 'invalid_request_error' } });
      return false;
    }
    const entry = config.modelRouting[modelName];
    if (!entry) {
      res.status(400).json({ error: { message: `Unknown model: ${modelName}`, type: 'invalid_request_error' } });
      return false;
    }
    req.provider = { name: entry.provider };
    req.body.model = entry.model;
    return true;
  }

  router.post('/v1/messages', async (req: AuthenticatedRequest, res: Response) => {
    if (!resolveModel(req, res)) return;

    const providerType = providerProxy['translator'].getProviderType(req.provider!.name);
    if (providerType === 'openai') {
      req.body = providerProxy['translator'].anthropicToOpenAIRequest(req.body as any, req.provider!.name);
      logger.debug('Translated Anthropic → OpenAI for /v1/messages');
    }

    await providerProxy.forwardRequest(req, res);
  });

  router.post('/v1/chat/completions', async (req: AuthenticatedRequest, res: Response) => {
    if (!resolveModel(req, res)) return;

    const providerType = providerProxy['translator'].getProviderType(req.provider!.name);
    if (providerType === 'anthropic') {
      req.body = providerProxy['translator'].openaiToAnthropicRequest(req.body as any, req.provider!.name);
      logger.debug('Translated OpenAI → Anthropic for /v1/chat/completions');
    }

    await providerProxy.forwardRequest(req, res);
  });

  router.get('/v1/models', (req: AuthenticatedRequest, res: Response) => {
    const models = Object.entries(config.modelRouting).map(([name, entry]) => ({
      id: name,
      object: 'model',
      created: 0,
      owned_by: entry.provider,
    }));
    res.json({ object: 'list', data: models });
  });

  router.use('*', (req: AuthenticatedRequest, res: Response) => {
    res.status(400).json({
      error: {
        message: 'Unsupported LLM API endpoint. Use /v1/messages or /v1/chat/completions',
        type: 'invalid_request_error',
      },
    });
  });

  return router;
}
