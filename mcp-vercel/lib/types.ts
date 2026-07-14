export interface PendingCommand {
  id: string;
  userId: string;
  tool: string;
  params: Record<string, unknown>;
  status: 'pending' | 'executing' | 'completed' | 'failed';
  result?: unknown;
  error?: string;
  createdAt: number;
  expiresAt: number;
}

export interface ExtensionSession {
  id: string;
  userId: string;
  connectedAt: number;
  lastPollAt: number;
  userAgent?: string;
}

export interface UserProfile {
  id: string;
  apiKey: string;
  extensionSecret: string;
  createdAt: number;
}
