export interface AnthropicMessage {
  role: 'user' | 'assistant' | 'system';
  content: string | (AnthropicContentBlock | AnthropicToolUseBlock | AnthropicToolResultBlock)[];
}

export interface AnthropicContentBlock {
  type: 'text';
  text: string;
}

export interface AnthropicToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface AnthropicToolResultBlock {
  type: 'tool_result';
  tool_use_id: string;
  content: string | AnthropicContentBlock[];
}

export interface AnthropicTool {
  name: string;
  description?: string;
  input_schema: Record<string, unknown>;
}

export interface AnthropicRequest {
  model: string;
  messages: AnthropicMessage[];
  max_tokens: number;
  stream?: boolean;
  system?: string;
  temperature?: number;
  top_p?: number;
  stop_sequences?: string[];
  anthropic_version?: string;
  metadata?: Record<string, unknown>;
  tools?: AnthropicTool[];
  tool_choice?: { type: string; name?: string } | string;
}

export interface AnthropicResponse {
  id: string;
  type: 'message';
  role: string;
  content: (AnthropicContentBlock | AnthropicToolUseBlock)[];
  model: string;
  stop_reason: string;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

export interface AnthropicStreamEvent {
  type: string;
  message?: Partial<AnthropicResponse> | AnthropicResponse;
  index?: number;
  content_block?: {
    type: string;
    text?: string;
    id?: string;
    name?: string;
    input?: Record<string, unknown>;
  };
  delta?: {
    type: string;
    text?: string;
    stop_reason?: string;
    stop_sequence?: string | null;
    partial_json?: string;
  };
  usage?: {
    output_tokens: number;
    input_tokens?: number;
  };
}

export interface StreamTranslationState {
  messageStartSent: boolean;
  contentBlockIndex: number;
  contentBlockOpen: boolean;
  currentBlockType: 'text' | 'tool_use' | null;
  toolCalls: Record<number, { id: string; name: string; anthropicBlockIndex: number }>;
}

export interface OpenAIMessage {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string | null;
  tool_calls?: OpenAIToolCall[];
  tool_call_id?: string;
}

export interface OpenAITool {
  type: 'function';
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  };
}

export interface OpenAIRequest {
  model: string;
  messages: OpenAIMessage[];
  max_tokens?: number;
  stream?: boolean;
  temperature?: number;
  top_p?: number;
  stop?: string[];
  n?: number;
  presence_penalty?: number;
  frequency_penalty?: number;
  response_format?: {
    type: string;
  };
  tools?: OpenAITool[];
  tool_choice?: string | { type: string; function?: { name: string } };
}

export interface OpenAIChoice {
  index: number;
  message: OpenAIMessage;
  finish_reason: string;
}

export interface OpenAIResponse {
  id: string;
  choices: OpenAIChoice[];
  model: string;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface OpenAIDelta {
  role?: string;
  content?: string;
  tool_calls?: OpenAIToolCallDelta[];
}

export interface OpenAIToolCall {
  id: string;
  type: string;
  function: {
    name: string;
    arguments: string;
  };
}

export interface OpenAIToolCallDelta {
  index: number;
  id?: string;
  type?: string;
  function?: {
    name?: string;
    arguments?: string;
  };
}

export interface OpenAIStreamChunk {
  id: string;
  choices: {
    index: number;
    delta: OpenAIDelta;
    finish_reason?: string;
  }[];
  model?: string;
}

export interface Session {
  updatedAt: string;
  clientId: string;
}
