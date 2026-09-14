import type { ConnectionError, ConnectionState, LogLevel, ChatMessage } from '../protocol';

export type LiveChatServiceListener = {
  onStatus: (state: ConnectionState) => void;
  onChat: (message: ChatMessage) => void;
  onError: (error: ConnectionError) => void;
  onLog?: (level: LogLevel, message: string) => void;
};

/** Provider-neutral lifecycle used by voting, desktop and web orchestration. */
export interface LiveChatService {
  getState(): ConnectionState;
  connect(channelInput?: string): Promise<void>;
  disconnect(): Promise<void>;
}

export type LiveChatServiceFactory = (listener: LiveChatServiceListener) => LiveChatService;
