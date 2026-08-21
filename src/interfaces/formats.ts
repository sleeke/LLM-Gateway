export interface AnthropicMessage {
  role: 'user' | 'assistant' | 'system';
  content: string | AnthropicContentBlock[];
}

export interface AnthropicContentBlock {
  type: 'text';
  text: string;
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
}

export interface AnthropicResponse {
  id: string;
  type: 'message';
  role: string;
  content: AnthropicContentBlock[];
  model: string;
  stop_reason: string;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

export interface AnthropicStreamEvent {
  type: string;
  message?: AnthropicResponse;
  index?: number;
  delta?: {
    type: string;
    text?: string;
    stop_reason?: string;
  };
}

export interface OpenAIMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
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
  provider: string | null;
  updatedAt: string;
  clientId: string;
}
