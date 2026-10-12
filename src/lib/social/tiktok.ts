import crypto from 'node:crypto';
import type {
  SocialAccount,
  SocialAnalytics,
  SocialComment,
  SocialMessage,
  SocialPlatform,
  SocialPost,
  SocialPublishOptions,
  SocialWebhookPayload,
  OAuthConfig,
} from './types';
import {
  SocialError,
  AuthenticationError,
  RateLimitError,
} from './types';
import { BaseSocialProvider, type Logger } from './base-provider';

interface TikTokTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
  scope: string;
  open_id?: string;
}

interface TikTokUser {
  open_id: string;
  display_name: string;
  username: string;
  avatar_url: string;
  follower_count: number;
  following_count: number;
  video_count: number;
  likes_count: number;
}

interface TikTokVideoPublishResponse {
  data: {
    publish_id: string;
    video_id?: string;
    status: string;
    create_time: number;
  };
}

interface TikTokVideoStatus {
  data: {
    public_video_id?: string;
    status: string;
    fail_reason?: string;
  };
}

interface TikTokComment {
  comment_id: string;
  text: string;
  user: {
    open_id: string;
    display_name: string;
    nickname: string;
    avatar_url: string;
  };
  create_time: number;
  reply_comment_id?: string;
  parent_comment_id?: string;
}

interface TikTokAnalyticsData {
  follower_count: number;
  video_count: number;
  following_count: number;
  likes_count: number;
}

interface TikTokVideoAnalytics {
  data: {
    list: Array<{
      date: string;
      metrics: Record<string, number>;
    }>;
  };
}

export class TikTokProvider extends BaseSocialProvider {
  readonly platform: SocialPlatform = 'tiktok';

  constructor(config: OAuthConfig, logger?: Logger) {
    super({
      ...config,
      authUrl: config.authUrl || 'https://www.tiktok.com/v2/auth/authorize/',
      tokenUrl: config.tokenUrl || 'https://open.tiktokapis.com/v2/oauth/token/',
      apiUrl: config.apiUrl || 'https://open.tiktokapis.com/v2',
    }, logger);
  }

  protected async exchangeCodeForToken(code: string): Promise<{
    accessToken: string;
    refreshToken?: string;
    expiresIn?: number;
  }> {
    const response = await fetch(this.config.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_key: this.config.clientId,
        client_secret: this.config.clientSecret,
        code,
        grant_type: 'authorization_code',
        redirect_uri: this.config.redirectUri,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new AuthenticationError('tiktok', `Failed to exchange code for token: ${errorBody}`);
    }

    const data = (await response.json()) as TikTokTokenResponse;
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in,
    };
  }

  async authenticate(code: string): Promise<SocialAccount> {
    const tokenData = await this.exchangeCodeForToken(code);

    const tempAccount = this.createAccount(tokenData, '', '');
    const user = await this._request<{ data: { user: TikTokUser } }>(
      'POST',
      '/user/info/',
      { fields: ['open_id', 'display_name', 'username', 'avatar_url', 'follower_count', 'following_count', 'video_count'] },
      tempAccount,
    );

    return this.createAccount(
      tokenData,
      user.data.user.open_id,
      user.data.user.username,
      { avatarUrl: user.data.user.avatar_url },
    );
  }

  async refreshToken(account: SocialAccount): Promise<SocialAccount> {
    if (!account.refreshToken) {
      throw new AuthenticationError('tiktok', 'No refresh token available');
    }

    const response = await fetch(this.config.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_key: this.config.clientId,
        client_secret: this.config.clientSecret,
        grant_type: 'refresh_token',
        refresh_token: account.refreshToken,
      }),
    });

    if (!response.ok) {
      throw new AuthenticationError('tiktok', 'Failed to refresh TikTok token');
    }

    const data = (await response.json()) as TikTokTokenResponse;
    const now = new Date();

    return {
      ...account,
      accessToken: data.access_token,
      refreshToken: data.refresh_token ?? account.refreshToken,
      tokenExpiresAt: new Date(now.getTime() + data.expires_in * 1000),
      updatedAt: now,
    };
  }

  async publishPost(account: SocialAccount, options: SocialPublishOptions): Promise<SocialPost> {
    if (!options.mediaUrls || options.mediaUrls.length === 0) {
      throw new SocialError('TikTok posts require at least one video URL', 'tiktok', 'VIDEO_REQUIRED');
    }

    const videoUrl = options.mediaUrls[0];

    const initResponse = await this._request<TikTokVideoPublishResponse>(
      'POST',
      '/video/publish/video/init/',
      {
        post_info: {
          title: options.content.substring(0, 150),
          description: options.content,
          disable_duet: false,
          disable_comment: false,
          disable_stitch: false,
          privacy_level: 'PUBLIC_TO_EVERYONE',
        },
        source_info: {
          source: 'PULL_FROM_URL',
          video_url: videoUrl,
        },
      },
      account,
    );

    const publishId = initResponse.data.publish_id;

    await this.waitForVideoPublish(account, publishId);

    const status = await this._request<TikTokVideoStatus>(
      'POST',
      '/video/publish/status/fetch/',
      { publish_id: publishId },
      account,
    );

    return this.createPost(
      account.id,
      options.content,
      status.data.public_video_id || publishId,
      options.mediaUrls,
    );
  }

  private async waitForVideoPublish(account: SocialAccount, publishId: string): Promise<void> {
    const maxChecks = 60;
    const intervalMs = 10000;

    for (let i = 0; i < maxChecks; i++) {
      await this.delay(intervalMs);

      const status = await this._request<TikTokVideoStatus>(
        'POST',
        '/video/publish/status/fetch/',
        { publish_id: publishId },
        account,
      );

      if (status.data.status === 'COMPLETE') {
        return;
      }

      if (status.data.status === 'FAILED') {
        throw new SocialError(
          `TikTok video publish failed: ${status.data.fail_reason || 'Unknown reason'}`,
          'tiktok',
          'VIDEO_PUBLISH_FAILED',
        );
      }
    }

    throw new SocialError('TikTok video publish timed out', 'tiktok', 'VIDEO_PUBLISH_TIMEOUT');
  }

  async deletePost(account: SocialAccount, postId: string): Promise<void> {
    await this._request<{ data: { error_code: string } }>(
      'POST',
      '/video/delete/',
      { video_id: postId },
      account,
    );
  }

  async getAnalytics(account: SocialAccount, period: { start: Date; end: Date }): Promise<SocialAnalytics> {
    const user = await this._request<{ data: TikTokAnalyticsData }>(
      'POST',
      '/user/info/',
      {
        fields: ['follower_count', 'video_count', 'following_count', 'likes_count'],
      },
      account,
    );

    let impressions = 0;
    let engagementRate = 0;

    try {
      const videoAnalytics = await this._request<TikTokVideoAnalytics>(
        'POST',
        '/video/data/',
        {
          start_date: this.formatTikTokDate(period.start),
          end_date: this.formatTikTokDate(period.end),
          metrics: ['video_view_count', 'video_like_count', 'video_comment_count', 'video_share_count', 'video_reach_count'],
        },
        account,
      );

      for (const day of videoAnalytics.data.list) {
        impressions += day.metrics['video_view_count'] ?? 0;
      }

      if (impressions > 0) {
        engagementRate = 0;
      }
    } catch {
      this.logger.warn('Failed to fetch TikTok video analytics');
    }

    return {
      followers: user.data.follower_count,
      following: user.data.following_count,
      postsCount: user.data.video_count,
      engagementRate,
      reach: Math.floor(impressions * 0.7),
      impressions,
      period,
    };
  }

  async getComments(account: SocialAccount, postId: string): Promise<SocialComment[]> {
    const comments = await this.fetchAllPaginated<TikTokComment>(
      `/video/comment/list/?video_id=${postId}&count=100`,
      account,
      'comments',
    );

    return comments.map((c) => ({
      id: c.comment_id,
      postId,
      platform: 'tiktok' as SocialPlatform,
      authorName: c.user.display_name || c.user.nickname,
      authorUsername: c.user.open_id,
      content: c.text,
      createdAt: new Date(c.create_time * 1000),
      isReply: !!c.parent_comment_id,
    }));
  }

  async replyToComment(account: SocialAccount, commentId: string, content: string): Promise<SocialComment> {
    const result = await this._request<{ data: { id: string; text: string; create_time: number } }>(
      'POST',
      '/video/comment/reply/',
      {
        comment_id: commentId,
        content,
        media_type: 'VIDEO',
      },
      account,
    );

    return {
      id: result.data.id,
      postId: commentId,
      platform: 'tiktok',
      authorName: account.platformUsername,
      authorUsername: account.platformAccountId,
      content,
      createdAt: new Date(result.data.create_time * 1000),
      isReply: true,
    };
  }

  async getMessages(_account: SocialAccount, _conversationId?: string): Promise<SocialMessage[]> {
    throw new SocialError('TikTok does not support direct messaging via this API', 'tiktok', 'NOT_SUPPORTED');
  }

  async sendMessage(_account: SocialAccount, _conversationId: string, _content: string, _mediaUrl?: string): Promise<SocialMessage> {
    throw new SocialError('TikTok does not support direct messaging via this API', 'tiktok', 'NOT_SUPPORTED');
  }

  verifyWebhook(payload: SocialWebhookPayload, signature: string): boolean {
    if (!this.config.clientSecret) return false;

    const timestamp = payload.data['timestamp'] as string | undefined;
    const nonce = payload.data['nonce'] as string | undefined;

    if (!timestamp || !nonce) return false;

    const message = timestamp + nonce + JSON.stringify(payload.data);
    const expected = crypto.createHmac('sha256', this.config.clientSecret).update(message).digest('hex');

    try {
      return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
    } catch {
      return false;
    }
  }

  async handleWebhook(payload: SocialWebhookPayload): Promise<void> {
    this.logger.info('Processing TikTok webhook', {
      event: payload.event,
      timestamp: payload.timestamp,
    });

    if (payload.event === 'video.publish') {
      this.logger.info('TikTok video published', { data: payload.data });
    }

    if (payload.event === 'comment.create') {
      this.logger.info('TikTok comment created', { data: payload.data });
    }
  }

  private formatTikTokDate(date: Date): string {
    return date.toISOString().split('T')[0];
  }

  protected isTokenExpired(account: SocialAccount): boolean {
    if (!account.tokenExpiresAt) return false;
    return Date.now() >= account.tokenExpiresAt.getTime() - 60_000;
  }

  protected buildAuthHeaders(account: SocialAccount): Record<string, string> {
    return { Authorization: `Bearer ${account.accessToken}` };
  }

  protected extractRateLimitInfo(response: Response): { resetAt?: Date; limit?: number } | null {
    const remaining = response.headers.get('x-ratelimit-remaining');
    const reset = response.headers.get('x-ratelimit-reset');

    if (remaining === '0' && reset) {
      return {
        resetAt: new Date(parseInt(reset, 10) * 1000),
        limit: undefined,
      };
    }

    return null;
  }

  protected extractErrorData(errorBody: string): { message: string; code: string; statusCode: number; retryable: boolean } {
    try {
      const data = JSON.parse(errorBody) as {
        error?: { code: string; message: string; log_id: string };
        data?: { error_code: string; description: string };
      };

      if (data.error) {
        return {
          message: data.error.message,
          code: data.error.code,
          statusCode: 500,
          retryable: data.error.code === 'rate_limit_exceeded' || data.error.code === 'too_many_requests',
        };
      }

      if (data.data?.error_code) {
        return {
          message: data.data.description || errorBody,
          code: data.data.error_code,
          statusCode: 500,
          retryable: false,
        };
      }
    } catch {
      // ignore parse errors
    }

    return { message: errorBody, code: 'UNKNOWN', statusCode: 500, retryable: false };
  }
}