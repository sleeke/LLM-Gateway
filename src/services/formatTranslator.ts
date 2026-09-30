import { Config } from '../interfaces/config';
import {
  AnthropicRequest,
  AnthropicResponse,
  AnthropicContentBlock,
  AnthropicStreamEvent,
  AnthropicToolUseBlock,
  AnthropicToolResultBlock,
  OpenAIRequest,
  OpenAIResponse,
  OpenAIMessage,
  OpenAIStreamChunk,
  AnthropicMessage,
  StreamTranslationState,
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

  anthropicToOpenAIRequest(body: AnthropicRequest, providerName: string): OpenAIRequest {
    const result: OpenAIRequest = {
      model: body.model,
      messages: [],
      max_tokens: body.max_tokens,
      stream: body.stream,
    };

    if (body.temperature !== undefined) result.temperature = body.temperature;
    if (body.top_p !== undefined) result.top_p = body.top_p;
    if (body.stop_sequences && body.stop_sequences.length > 0) result.stop = body.stop_sequences;

    if (body.tools && body.tools.length > 0) {
      result.tools = body.tools.map((tool) => ({
        type: 'function' as const,
        function: {
          name: tool.name,
          ...(tool.description !== undefined ? { description: tool.description } : {}),
          parameters: this.sanitizeJsonSchemaForOpenAI(tool.input_schema),
        },
      }));
    }

    const messages: OpenAIMessage[] = [];
    const systemMessage = typeof body.system === 'string' ? body.system : this.flattenContent(body.system || []);

    for (const msg of body.messages) {
      if (msg.role === 'system' && systemMessage) {
        continue;
      }

      if (typeof msg.content === 'string') {
        messages.push({ role: msg.role as 'user' | 'assistant', content: msg.content });
        continue;
      }

      const blocks = msg.content || [];

      if (msg.role === 'assistant') {
        const toolUseBlocks = blocks.filter((b): b is AnthropicToolUseBlock => b.type === 'tool_use');
        const textContent = blocks
          .filter((b): b is AnthropicContentBlock => b.type === 'text')
          .map((b) => b.text)
          .join('');

        if (toolUseBlocks.length > 0) {
          messages.push({
            role: 'assistant',
            content: textContent || null,
            tool_calls: toolUseBlocks.map((b) => ({
              id: b.id,
              type: 'function' as const,
              function: {
                name: b.name,
                arguments: JSON.stringify(b.input),
              },
            })),
          });
        } else {
          messages.push({ role: 'assistant', content: textContent });
        }
      } else if (msg.role === 'user') {
        const toolResultBlocks = blocks.filter((b): b is AnthropicToolResultBlock => b.type === 'tool_result');
        const textContent = blocks
          .filter((b): b is AnthropicContentBlock => b.type === 'text')
          .map((b) => b.text)
          .join('');

        if (toolResultBlocks.length > 0) {
          if (textContent) {
            messages.push({ role: 'user', content: textContent });
          }
          for (const tr of toolResultBlocks) {
            messages.push({
              role: 'tool',
              content: typeof tr.content === 'string' ? tr.content : this.flattenContent(tr.content),
              tool_call_id: tr.tool_use_id,
            });
          }
        } else {
          messages.push({ role: 'user', content: textContent });
        }
      } else {
        messages.push({
          role: msg.role as 'user' | 'assistant',
          content: this.flattenContent(blocks.filter((b): b is AnthropicContentBlock => b.type === 'text')),
        });
      }
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
      model: body.model,
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
        systemContent = msg.content || undefined;
        continue;
      }
      messages.push({
        role: msg.role as 'user' | 'assistant',
        content: msg.content || '',
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
    const content: (AnthropicContentBlock | AnthropicToolUseBlock)[] = (choice.message.tool_calls || []).map((tc) => ({
      type: 'tool_use' as const,
      id: tc.id,
      name: tc.function.name,
      input: this.parseToolArguments(tc.function.arguments),
    }));

    if (content.length === 0 && choice.message.content) {
      content.push({ type: 'text', text: choice.message.content });
    }

    return {
      id: `msg_${Date.now()}`,
      type: 'message',
      role: 'assistant',
      content,
      model: body.model,
      stop_reason: this.mapFinishReason(choice.finish_reason),
      usage: {
        input_tokens: body.usage.prompt_tokens,
        output_tokens: body.usage.completion_tokens,
      },
    };
  }

  private parseToolArguments(argumentsStr: string): Record<string, unknown> {
    try {
      return JSON.parse(argumentsStr);
    } catch {
      return { raw: argumentsStr };
    }
  }

  anthropicToOpenAIResponse(body: AnthropicResponse): OpenAIResponse {
    const textBlock = body.content.find((c): c is AnthropicContentBlock => c.type === 'text');
    const content = textBlock?.text || '';
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

  createStreamState(): StreamTranslationState {
    return {
      messageStartSent: false,
      contentBlockIndex: 0,
      contentBlockOpen: false,
      currentBlockType: null,
      toolCalls: {},
    };
  }

  sanitizeJsonSchemaForOpenAI(schema: unknown): Record<string, unknown> {
    if (!schema || typeof schema !== 'object') {
      return {};
    }
    if (Array.isArray(schema)) {
      return schema.map((item) => this.sanitizeJsonSchemaForOpenAI(item)) as unknown as Record<string, unknown>;
    }

    const clean: Record<string, any> = { ...schema };
    delete clean['$schema'];

    if ('prefixItems' in clean) {
      if (!clean.items || (typeof clean.items === 'object' && Object.keys(clean.items).length === 0)) {
        clean.items = {};
      }
      delete clean.prefixItems;
    }

    if (Array.isArray(clean.items)) {
      clean.items = {};
    }

    if (clean.type === 'array' && !clean.items) {
      clean.items = {};
    }

    if (clean.properties && typeof clean.properties === 'object') {
      clean.properties = Object.fromEntries(
        Object.entries(clean.properties).map(([k, v]) => [k, this.sanitizeJsonSchemaForOpenAI(v)])
      );
    }

    if (clean.patternProperties && typeof clean.patternProperties === 'object') {
      clean.patternProperties = Object.fromEntries(
        Object.entries(clean.patternProperties).map(([k, v]) => [k, this.sanitizeJsonSchemaForOpenAI(v)])
      );
    }

    if (clean.items && typeof clean.items === 'object' && !Array.isArray(clean.items)) {
      clean.items = this.sanitizeJsonSchemaForOpenAI(clean.items);
    }

    if (clean.additionalProperties && typeof clean.additionalProperties === 'object') {
      clean.additionalProperties = this.sanitizeJsonSchemaForOpenAI(clean.additionalProperties);
    }

    for (const comb of ['anyOf', 'allOf', 'oneOf']) {
      if (Array.isArray(clean[comb])) {
        clean[comb] = clean[comb].map((item: unknown) => this.sanitizeJsonSchemaForOpenAI(item));
      }
    }

    if (clean.$defs && typeof clean.$defs === 'object') {
      clean.$defs = Object.fromEntries(
        Object.entries(clean.$defs).map(([k, v]) => [k, this.sanitizeJsonSchemaForOpenAI(v)])
      );
    }

    if (clean.definitions && typeof clean.definitions === 'object') {
      clean.definitions = Object.fromEntries(
        Object.entries(clean.definitions).map(([k, v]) => [k, this.sanitizeJsonSchemaForOpenAI(v)])
      );
    }

    return clean;
  }

  translateOpenAIStreamChunkToAnthropic(
    chunk: OpenAIStreamChunk,
    providerNameOrState?: string | StreamTranslationState,
    state?: StreamTranslationState
  ): AnthropicStreamEvent[] {
    const streamState = (typeof providerNameOrState === 'object' ? providerNameOrState : state) || this.createStreamState();
    const events: AnthropicStreamEvent[] = [];
    const choice = chunk.choices?.[0];
    if (!choice) return events;

    if (!streamState.messageStartSent) {
      events.push({
        type: 'message_start',
        message: {
          id: chunk.id || `msg_${Date.now()}`,
          type: 'message',
          role: 'assistant',
          content: [],
          model: chunk.model || '',
          stop_reason: '',
          usage: { input_tokens: 0, output_tokens: 0 },
        },
      });
      streamState.messageStartSent = true;
    }

    const delta = choice.delta;

    if (delta?.tool_calls) {
      for (const tc of delta.tool_calls) {
        if (tc.id && tc.function?.name) {
          if (streamState.contentBlockOpen) {
            events.push({
              type: 'content_block_stop',
              index: streamState.contentBlockIndex,
            });
            streamState.contentBlockIndex++;
            streamState.contentBlockOpen = false;
          }
          const anthropicBlockIndex = streamState.contentBlockIndex;
          streamState.toolCalls[tc.index] = {
            id: tc.id,
            name: tc.function.name,
            anthropicBlockIndex,
          };
          events.push({
            type: 'content_block_start',
            index: anthropicBlockIndex,
            content_block: {
              type: 'tool_use',
              id: tc.id,
              name: tc.function.name,
              input: {},
            },
          });
          streamState.contentBlockOpen = true;
          streamState.currentBlockType = 'tool_use';
        }
        if (tc.function?.arguments) {
          const tcInfo = streamState.toolCalls[tc.index];
          if (tcInfo) {
            events.push({
              type: 'content_block_delta',
              index: tcInfo.anthropicBlockIndex,
              delta: {
                type: 'input_json_delta',
                partial_json: tc.function.arguments,
              },
            });
          }
        }
      }
    } else if (delta?.content) {
      if (streamState.contentBlockOpen && streamState.currentBlockType !== 'text') {
        events.push({
          type: 'content_block_stop',
          index: streamState.contentBlockIndex,
        });
        streamState.contentBlockIndex++;
        streamState.contentBlockOpen = false;
      }
      if (!streamState.contentBlockOpen) {
        events.push({
          type: 'content_block_start',
          index: streamState.contentBlockIndex,
          content_block: {
            type: 'text',
            text: '',
          },
        });
        streamState.contentBlockOpen = true;
        streamState.currentBlockType = 'text';
      }
      events.push({
        type: 'content_block_delta',
        index: streamState.contentBlockIndex,
        delta: {
          type: 'text_delta',
          text: delta.content,
        },
      });
    }

    if (choice.finish_reason) {
      if (streamState.contentBlockOpen) {
        events.push({
          type: 'content_block_stop',
          index: streamState.contentBlockIndex,
        });
        streamState.contentBlockOpen = false;
      }
      events.push({
        type: 'message_delta',
        delta: {
          type: 'message_delta',
          stop_reason: this.mapFinishReason(choice.finish_reason),
          stop_sequence: null,
        },
        usage: {
          output_tokens: 0,
        },
      });
      events.push({ type: 'message_stop' });
    }

    return events;
  }

  translateAnthropicStreamEventToOpenAI(event: AnthropicStreamEvent, providerName: string): OpenAIStreamChunk[] {
    const chunks: OpenAIStreamChunk[] = [];

    switch (event.type) {
      case 'message_start': {
        if (event.message) {
          chunks.push({
            id: event.message.id || `msg_${Date.now()}`,
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
            model: '',
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
            model: '',
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

  private flattenContent(blocks: AnthropicContentBlock[] | string | unknown): string {
    if (typeof blocks === 'string') return blocks;
    if (Array.isArray(blocks)) {
      return blocks
        .map((b) => {
          if (typeof b === 'string') return b;
          if (b && typeof b === 'object' && 'text' in b && typeof b.text === 'string') return b.text;
          return '';
        })
        .join('');
    }
    return '';
  }

  private mapFinishReason(reason: string): string {
    switch (reason) {
      case 'stop':
        return 'end_turn';
      case 'length':
        return 'max_tokens';
      case 'content_filter':
        return 'stop_sequence';
      case 'tool_calls':
        return 'tool_use';
      default:
        return 'end_turn';
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
