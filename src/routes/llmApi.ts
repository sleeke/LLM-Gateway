import { Router, Response } from 'express';
import { AuthenticatedRequest } from '../middleware/apiKeyAuth';
import { ProviderProxy } from '../services/providerProxy';
import { logger } from '../utils/logger';

export function createLLMApiRouter(providerProxy: ProviderProxy): Router {
  const router = Router();

  router.post('/v1/messages', async (req: AuthenticatedRequest, res: Response) => {
    const providerType = req.provider?.name ? providerProxy['translator'].getProviderType(req.provider.name) : 'openai';
    const isAnthropicFormat = providerType === 'anthropic';

    if (isAnthropicFormat) {
      logger.debug('Passing through Anthropic format request');
      req.body = req.body;
    } else {
      const translator = providerProxy['translator'];
      const providerName = req.provider!.name;
      req.body = translator.anthropicToOpenAIRequest(req.body as any, providerName);
      logger.debug('Translated request body', { body: req.body });
    }

    await providerProxy.forwardRequest(req, res);
  });

  router.post('/v1/chat/completions', async (req: AuthenticatedRequest, res: Response) => {
    const providerType = req.provider?.name ? providerProxy['translator'].getProviderType(req.provider.name) : 'openai';
    const isOpenAIFormat = providerType === 'openai';

    if (isOpenAIFormat) {
      logger.debug('Passing through OpenAI format request');
      req.body = req.body;
    } else {
      const translator = providerProxy['translator'];
      const providerName = req.provider!.name;
      req.body = translator.openaiToAnthropicRequest(req.body as any, providerName);
    }

    await providerProxy.forwardRequest(req, res);
  });

  router.get('/v1/models', async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!req.provider) {
        res.status(403).json({ error: { message: 'No provider selected', type: 'session_error' } });
        return;
      }

      const providerConfig = providerProxy['config'].providers[req.provider.name];
      const providerUrl = `${providerConfig.baseURL}/models`;
      const headers: Record<string, string> = {};
      if (providerConfig.apiKey) {
        headers['Authorization'] = `Bearer ${providerConfig.apiKey}`;
      }

      const response = await fetch(providerUrl, { headers });
      const responseBody = await response.text();
      res.status(response.status);
      res.setHeader('Content-Type', response.headers.get('content-type') || 'application/json');
      res.send(responseBody);
    } catch (error) {
      logger.error('Models request failed', { error: (error as Error).message });
      res.status(502).json({ error: { message: 'Provider request failed', type: 'provider_error' } });
    }
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
