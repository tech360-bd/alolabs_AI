import type { AIResponse } from './types';

export function mapChatFinishReason(reason: string | null): AIResponse['finishReason'] {
  switch (reason) {
    case 'stop': return 'stop';
    case 'length': return 'length';
    case 'tool_calls': return 'tool-calls';
    default: return 'stop';
  }
}

export function mapRouterFinishReason(reason: string | null): AIResponse['finishReason'] {
  switch (reason) {
    case 'stop':
      return 'stop';
    case 'length':
    case 'max_tokens':
      return 'length';
    case 'tool_calls':
      return 'tool-calls';
    case 'content_filter':
      return 'content-filter';
    default:
      return 'stop';
  }
}
