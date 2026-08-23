import { Config } from '../interfaces/config';
import { SessionManager } from './sessionManager';
import { FormatTranslator } from './formatTranslator';
import { logger } from '../utils/logger';
import { AuthenticatedRequest } from '../middleware/apiKeyAuth';
import { Response } from 'express';

export class ProviderProxy {
  constructor(
    private config: Config,
    private sessionManager: SessionManager,
    private translator: FormatTranslator
  ) {}

  async forwardRequest(req: AuthenticatedRequest, res: Response): Promise<void> {
    if (!req.session || !req.provider) {
      res.status(500).json({ error: { message: 'Internal server error', type: 'server_error' } });
      return;
    }

    const providerName = req.provider.name;
    const providerConfig = this.config.providers[providerName];
    const providerType = this.translator.getProviderType(providerName);

    let requestPath = req.path;
    if (providerType === 'openai' && requestPath === '/v1/messages') {
      requestPath = '/v1/chat/completions';
    } else if (providerType === 'anthropic' && requestPath === '/v1/chat/completions') {
      requestPath = '/v1/messages';
    }

    const queryString = req.url.split('?')[1] || '';
    const providerUrl = providerConfig.baseURL.replace(/\/$/, '') + requestPath + (queryString ? `?${queryString}` : '');

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (providerConfig.apiKey) {
      headers['Authorization'] = `Bearer ${providerConfig.apiKey}`;
    }

    if (providerType === 'anthropic') {
      headers['anthropic-version'] = '2023-06-01';
      headers['Accept'] = req.headers.accept || 'application/json';
    } else {
      headers['Accept'] = req.headers.accept || 'application/json';
    }

    logger.info('Forwarding request to provider', {
      clientId: req.session.clientId,
      provider: providerName,
      path: requestPath,
      method: req.method,
      model: req.body.model,
      url: providerUrl
    });

    try {
      const response = await fetch(providerUrl, {
        method: req.method,
        headers,
        body: ['GET', 'HEAD'].includes(req.method) ? undefined : JSON.stringify(req.body),
      });

      const contentType = response.headers.get('content-type') || '';
      const isStreaming = contentType.includes('text/event-stream') || contentType.includes('application/x-ndjson');

      if (isStreaming && req.body?.stream) {
        res.setHeader('Content-Type', contentType.includes('text/event-stream') ? 'text/event-stream' : 'application/x-ndjson');
        res.setHeader('Transfer-Encoding', 'chunked');

        const reader = response.body?.getReader();
        if (!reader) {
          throw new Error('No response body reader available');
        }

        const decoder = new TextDecoder();
        const encoder = new TextEncoder();

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            if (providerType === 'anthropic') {
              res.write(encoder.encode(chunk));
            } else {
              const lines = chunk.split('\n');
              for (const line of lines) {
                if (line.trim().startsWith('data: ')) {
                  const dataStr = line.trim().substring(6);
                  if (dataStr === '[DONE]') {
                    res.write(encoder.encode('data: [DONE]\n\n'));
                    continue;
                  }
                  try {
                    const parsed = JSON.parse(dataStr);
                    const translatedEvents = this.translator.translateOpenAIStreamChunkToAnthropic(parsed, providerName);
                    for (const event of translatedEvents) {
                      res.write(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
                    }
                  } catch {
                    res.write(encoder.encode(line + '\n'));
                  }
                } else if (line.trim()) {
                  res.write(encoder.encode(line + '\n'));
                }
              }
            }
          }
        } finally {
          reader.releaseLock();
          res.end();
        }
        return;
      }

      const responseBody = await response.text();
      res.status(response.status);
      res.setHeader('Content-Type', contentType);

      if (!response.ok) {
        logger.error('Provider returned error', {
          status: response.status,
          statusText: response.statusText,
          body: responseBody,
        });
        res.send(responseBody);
        return;
      }

      let translatedBody = responseBody;
      try {
        const parsed = JSON.parse(responseBody);
        if (providerType === 'openai' && requestPath === '/v1/chat/completions') {
          const anthropicResponse = this.translator.openaiToAnthropicResponse(parsed);
          translatedBody = JSON.stringify(anthropicResponse);
        } else if (providerType === 'anthropic' && requestPath === '/v1/messages') {
          const openaiResponse = this.translator.anthropicToOpenAIResponse(parsed);
          translatedBody = JSON.stringify(openaiResponse);
        }
      } catch {
        // If JSON parse fails, pass through as-is
      }

      res.send(translatedBody);
    } catch (error) {
      logger.error('Provider request failed', {
        provider: providerName,
        error: (error as Error).message,
      });
      if (!res.headersSent) {
        res.status(502).json({
          error: {
            message: 'Provider request failed',
            type: 'provider_error',
          },
        });
      }
    }
  }
}
