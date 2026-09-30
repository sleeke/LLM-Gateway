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
    const clientFormat: 'anthropic' | 'openai' = req.path.startsWith('/v1/messages') ? 'anthropic' : 'openai';

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
      headers['anthropic-version'] = (req.headers['anthropic-version'] as string) || '2023-06-01';
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
        let buffer = '';
        const streamState = this.translator.createStreamState();

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            if (clientFormat === providerType) {
              const forwardChunk = lines.length > 0 ? lines.join('\n') + '\n' : '';
              if (forwardChunk) {
                res.write(encoder.encode(forwardChunk));
              }
            } else if (clientFormat === 'anthropic' && providerType === 'openai') {
              for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed.startsWith('data: ')) continue;
                const dataStr = trimmed.substring(6).trim();
                if (dataStr === '[DONE]') continue;

                try {
                  const parsed = JSON.parse(dataStr);
                  const events = this.translator.translateOpenAIStreamChunkToAnthropic(parsed, streamState);
                  for (const event of events) {
                    res.write(encoder.encode(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`));
                  }
                } catch {
                  // Ignore partial JSON
                }
              }
            } else if (clientFormat === 'openai' && providerType === 'anthropic') {
              for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed.startsWith('data: ')) continue;
                const dataStr = trimmed.substring(6).trim();

                try {
                  const parsed = JSON.parse(dataStr);
                  const chunks = this.translator.translateAnthropicStreamEventToOpenAI(parsed, providerName);
                  for (const chunk of chunks) {
                    res.write(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
                  }
                  if (parsed.type === 'message_stop') {
                    res.write(encoder.encode('data: [DONE]\n\n'));
                  }
                } catch {
                  // Ignore partial JSON
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
          requestBody: JSON.stringify(req.body),
          body: responseBody,
        });
        res.send(responseBody);
        return;
      }

      let translatedBody = responseBody;
      try {
        const parsed = JSON.parse(responseBody);
        if (clientFormat === 'anthropic' && providerType === 'openai') {
          const anthropicResponse = this.translator.openaiToAnthropicResponse(parsed);
          translatedBody = JSON.stringify(anthropicResponse);
        } else if (clientFormat === 'openai' && providerType === 'anthropic') {
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
