import { Config } from '../interfaces/config';
import {
  AnthropicRequest,
  AnthropicResponse,
  AnthropicContentBlock,
  AnthropicStreamEvent,
  OpenAIRequest,
  OpenAIResponse,
  OpenAIMessage,
  OpenAIStreamChunk,
  AnthropicMessage,
} from '../interfaces/formats';
import { logger } from '../utils/logger';

export class FormatTranslator {
  constructor(private config: Config) {}

  getProviderType(providerName: string): 'anthropic' | 'openai' {
    const provider = this.config.providers[providerName];
    if (!provider) {
      throw new Error(`Unknown provider: ${providerName}`);
    }
    return provider.type;
  }

  resolveModelAlias(providerName: string, model: string): string {
    const providerAliases = this.config.modelAliases[providerName];
    if (providerAliases && providerAliases[model]) {
      return providerAliases[model];
    }
    return model;
  }

  anthropicToOpenAIRequest(body: AnthropicRequest, providerName: string): OpenAIRequest {
    const result: OpenAIRequest = {
      model: this.resolveModelAlias(providerName, body.model),
      messages: [],
      max_tokens: body.max_tokens,
      stream: body.stream,
    };

    if (body.temperature !== undefined) result.temperature = body.temperature;
    if (body.top_p !== undefined) result.top_p = body.top_p;
    if (body.stop_sequences && body.stop_sequences.length > 0) result.stop = body.stop_sequences;

    const messages: OpenAIMessage[] = [];
    const systemMessage = typeof body.system === 'string' ? body.system : this.flattenContent(body.system || []);

    for (const msg of body.messages) {
      if (msg.role === 'system' && systemMessage) {
        continue;
      }
      messages.push({
        role: msg.role as 'user' | 'assistant',
        content: typeof msg.content === 'string' ? msg.content : this.flattenContent(msg.content),
      });
    }

    if (systemMessage) {
      result.messages = [
        { role: 'system', content: systemMessage },
        ...messages,
      ];
    } else {
      result.messages = messages;
    }

    logger.debug('Translated Anthropic → OpenAI request', { provider: providerName });
    return result;
  }

  openaiToAnthropicRequest(body: OpenAIRequest, providerName: string): AnthropicRequest {
    const result: AnthropicRequest = {
      model: this.resolveModelAlias(providerName, body.model),
      messages: [],
      max_tokens: body.max_tokens || 1024,
      stream: body.stream,
    };

    if (body.temperature !== undefined) result.temperature = body.temperature;
    if (body.top_p !== undefined) result.top_p = body.top_p;
    if (body.stop && body.stop.length > 0) result.stop_sequences = body.stop;

    const messages: AnthropicMessage[] = [];
    let systemContent: string | undefined;

    for (const msg of body.messages) {
      if (msg.role === 'system') {
        systemContent = msg.content;
        continue;
      }
      messages.push({
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
      });
    }

    if (systemContent) {
      result.system = systemContent;
    }

    result.messages = messages;

    logger.debug('Translated OpenAI → Anthropic request', { provider: providerName });
    return result;
  }

  openaiToAnthropicResponse(body: OpenAIResponse): AnthropicResponse {
    const choice = body.choices[0];
    return {
      id: `msg_${Date.now()}`,
      type: 'message',
      role: 'assistant',
      content: [{ type: 'text', text: choice.message.content }],
      model: body.model,
      stop_reason: this.mapFinishReason(choice.finish_reason),
      usage: {
        input_tokens: body.usage.prompt_tokens,
        output_tokens: body.usage.completion_tokens,
      },
    };
  }

  anthropicToOpenAIResponse(body: AnthropicResponse): OpenAIResponse {
    const content = body.content.find((c: { type: string; text?: string }) => c.type === 'text')?.text || '';
    return {
      id: body.id,
      choices: [
        {
          index: 0,
          message: { role: 'assistant', content },
          finish_reason: this.mapAnthropicStopReason(body.stop_reason),
        },
      ],
      model: body.model,
      usage: {
        prompt_tokens: body.usage.input_tokens,
        completion_tokens: body.usage.output_tokens,
        total_tokens: body.usage.input_tokens + body.usage.output_tokens,
      },
    };
  }

  translateOpenAIStreamChunkToAnthropic(chunk: OpenAIStreamChunk, providerName: string): AnthropicStreamEvent[] {
    const events: AnthropicStreamEvent[] = [];
    const choice = chunk.choices[0];
    if (!choice) return events;

    if (choice.delta.role && choice.delta.role === 'assistant') {
      events.push({
        type: 'message_start',
        message: {
          id: `msg_${Date.now()}`,
          type: 'message',
          role: 'assistant',
          content: [],
          model: this.resolveModelAlias(providerName, chunk.model || ''),
          stop_reason: '',
          usage: { input_tokens: 0, output_tokens: 0 },
        },
      });
      events.push({
        type: 'content_block_start',
        index: 0,
        message: undefined,
      });
    }

    if (choice.delta.content) {
      events.push({
        type: 'content_block_delta',
        index: 0,
        delta: {
          type: 'text_delta',
          text: choice.delta.content,
        },
      });
    }

    if (choice.finish_reason) {
      events.push({
        type: 'message_delta',
        delta: {
          type: 'message_delta',
          stop_reason: this.mapFinishReason(choice.finish_reason),
        },
      });
      events.push({ type: 'message_stop' });
    }

    return events;
  }

  translateAnthropicStreamEventToOpenAI(event: AnthropicStreamEvent, providerName: string): OpenAIStreamChunk[] {
    const chunks: OpenAIStreamChunk[] = [];
    const modelAlias = this.resolveModelAlias(providerName, '');

    switch (event.type) {
      case 'message_start': {
        if (event.message) {
          chunks.push({
            id: event.message.id,
            choices: [
              {
                index: 0,
                delta: { role: 'assistant' },
                finish_reason: undefined,
              },
            ],
            model: event.message.model,
          });
        }
        break;
      }
      case 'content_block_delta': {
        if (event.delta?.text) {
          chunks.push({
            id: `msg_${Date.now()}`,
            choices: [
              {
                index: 0,
                delta: { content: event.delta.text },
                finish_reason: undefined,
              },
            ],
            model: modelAlias,
          });
        }
        break;
      }
      case 'message_delta': {
        if (event.delta?.stop_reason) {
          chunks.push({
            id: `msg_${Date.now()}`,
            choices: [
              {
                index: 0,
                delta: {},
                finish_reason: this.mapAnthropicStopReason(event.delta.stop_reason),
              },
            ],
            model: modelAlias,
          });
        }
        break;
      }
      case 'message_stop': {
        break;
      }
      default:
        break;
    }

    return chunks;
  }

  private flattenContent(blocks: AnthropicContentBlock[]): string {
    return blocks.map((block) => block.text).join('');
  }

  private mapFinishReason(reason: string): string {
    switch (reason) {
      case 'stop':
        return 'stop';
      case 'length':
        return 'length';
      case 'content_filter':
        return 'content_filter';
      case 'tool_calls':
        return 'tool_calls';
      default:
        return 'stop';
    }
  }

  private mapAnthropicStopReason(reason: string): string {
    switch (reason) {
      case 'end_turn':
        return 'stop';
      case 'max_tokens':
        return 'length';
      case 'stop_sequence':
        return 'stop';
      case 'tool_use':
        return 'tool_calls';
      default:
        return 'stop';
    }
  }
}
