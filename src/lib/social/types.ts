export interface SocialAccount {
  id: string;
  companyId: string;
  platform: SocialPlatform;
  platformAccountId: string;
  platformUsername: string;
  accessToken: string;
  refreshToken?: string;
  tokenExpiresAt?: Date;
  metadata?: Record<string, unknown>;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type SocialPlatform =
  | 'facebook'
  | 'instagram'
  | 'linkedin'
  | 'twitter'
  | 'youtube'
  | 'tiktok'
  | 'pinterest'
  | 'telegram'
  | 'whatsapp';

export interface SocialPost {
  id: string;
  accountId: string;
  platform: SocialPlatform;
  platformPostId?: string;
  content: string;
  mediaUrls?: string[];
  scheduledAt?: Date;
  publishedAt?: Date;
  status: 'draft' | 'scheduled' | 'published' | 'failed';
  metrics?: SocialMetrics;
}

export interface SocialMetrics {
  likes: number;
  comments: number;
  shares: number;
  impressions: number;
  clicks: number;
  engagementRate: number;
}

export interface SocialComment {
  id: string;
  postId: string;
  platform: SocialPlatform;
  authorName: string;
  authorUsername: string;
  content: string;
  createdAt: Date;
  isReply: boolean;
}

export interface SocialMessage {
  id: string;
  accountId: string;
  platform: SocialPlatform;
  conversationId: string;
  direction: 'inbound' | 'outbound';
  content: string;
  mediaUrl?: string;
  senderName: string;
  senderId: string;
  createdAt: Date;
  isRead: boolean;
}

export interface SocialAnalytics {
  followers: number;
  following: number;
  postsCount: number;
  engagementRate: number;
  reach: number;
  impressions: number;
  period: { start: Date; end: Date };
}

export interface OAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scopes: string[];
  authUrl: string;
  tokenUrl: string;
  apiUrl: string;
}

export interface SocialPublishOptions {
  content: string;
  mediaUrls?: string[];
  scheduledAt?: Date;
  targeting?: Record<string, string>;
}

export interface SocialWebhookPayload {
  platform: SocialPlatform;
  event: string;
  data: Record<string, unknown>;
  timestamp: string;
  signature?: string;
}

export class SocialError extends Error {
  constructor(
    message: string,
    public readonly platform: SocialPlatform,
    public readonly code: string,
    public readonly statusCode?: number,
    public retryable: boolean = false,
  ) {
    super(message);
    this.name = 'SocialError';
  }
}

export class RateLimitError extends SocialError {
  constructor(
    platform: SocialPlatform,
    public readonly resetAt: Date,
    public readonly limit: number,
  ) {
    super(
      `Rate limit exceeded for ${platform}. Resets at ${resetAt.toISOString()}. Limit: ${limit}`,
      platform,
      'RATE_LIMIT_EXCEEDED',
      429,
      true,
    );
    this.name = 'RateLimitError';
  }
}

export class AuthenticationError extends SocialError {
  constructor(platform: SocialPlatform, message: string = 'Authentication failed') {
    super(message, platform, 'AUTHENTICATION_ERROR', 401, false);
    this.name = 'AuthenticationError';
  }
}

export class TokenExpiredError extends AuthenticationError {
  constructor(platform: SocialPlatform) {
    super(platform, 'Access token has expired');
    this.name = 'TokenExpiredError';
    this.retryable = true;
  }
}

export interface RetryConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
}

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
};