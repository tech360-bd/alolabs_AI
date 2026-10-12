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
  TokenExpiredError,
  RateLimitError,
} from './types';
import { BaseSocialProvider, type Logger } from './base-provider';

// ─── Threads Graph API Response Types ─────────────────────────────────────────

interface ThreadsTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

interface ThreadsLongLivedTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

interface ThreadsRefreshTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

interface ThreadsUserProfile {
  id: string;
  username: string;
  threads_profile_picture_url?: string;
  threads_biography?: string;
  follower_count?: number;
  following_count?: number;
  likes_count?: number;
  replies_count?: number;
  reposts_count?: number;
}

interface ThreadsMediaContainerResponse {
  id: string;
  status_code?: string;
}

interface ThreadsMediaPublishResponse {
  id: string;
}

interface ThreadsMediaItem {
  id: string;
  text?: string;
  media_type?: string;
  media_url?: string;
  permalink?: string;
  timestamp?: string;
  like_count?: number;
  reply_count?: number;
  repost_count?: number;
  views_count?: number;
  quote_count?: number;
  children?: { data: Array<{ id: string; media_type: string }> };
}

interface ThreadsReply {
  id: string;
  text?: string;
  media_type?: string;
  media_url?: string;
  permalink?: string;
  timestamp?: string;
  username?: string;
  like_count?: number;
  reply_count?: number;
  repost_count?: number;
}

interface ThreadsInsight {
  name: string;
  period: string;
  values: { value: number | string; end_time: string }[];
}

interface ThreadsConversation {
  id: string;
  participants: Array<{ id: string; username: string }>;
  last_message_at?: string;
  messages?: ThreadsMessageItem[];
}

interface ThreadsMessageItem {
  id: string;
  text?: string;
  media_type?: string;
  media_url?: string;
  timestamp?: string;
  from?: { id: string; username: string };
}

// ─── Threads Provider ─────────────────────────────────────────────────────────

export class ThreadsProvider extends BaseSocialProvider {
  readonly platform: SocialPlatform = 'threads' as SocialPlatform;

  constructor(config: OAuthConfig, logger?: Logger) {
    super({
      ...config,
      authUrl:
        config.authUrl ||
        'https://www.facebook.com/v21.0/dialog/oauth',
      tokenUrl:
        config.tokenUrl ||
        'https://graph.threads.net/oauth/access_token',
      apiUrl: config.apiUrl || 'https://graph.threads.net',
      scopes: config.scopes || [
        'threads_basic',
        'threads_content_publish',
        'threads_manage_responses',
        'threads_manage_insights',
      ],
    }, logger);
  }

  // ─── OAuth2 Flow ──────────────────────────────────────────────────────────

  protected async exchangeCodeForToken(code: string): Promise<{
    accessToken: string;
    refreshToken?: string;
    expiresIn?: number;
  }> {
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      grant_type: 'authorization_code',
      redirect_uri: this.config.redirectUri,
      code,
    });

    const response = await fetch(this.config.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: params.toString(),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new AuthenticationError(
        this.platform,
        `Failed to exchange code for Threads token: ${errorBody}`,
      );
    }

    const data = (await response.json()) as ThreadsTokenResponse & { error?: { message: string; code: number } };
    if (data.error) {
      throw new AuthenticationError(this.platform, data.error.message);
    }

    const shortLivedToken = data.access_token;

    const longLivedResponse = await fetch(
      'https://graph.threads.net/access_token?' +
        new URLSearchParams({
          grant_type: 'th_exchange_token',
          client_secret: this.config.clientSecret,
          access_token: shortLivedToken,
        }).toString(),
      { method: 'GET', headers: { Accept: 'application/json' } },
    );

    if (!longLivedResponse.ok) {
      this.logger.warn('Failed to exchange for long-lived token, using short-lived token');
      return {
        accessToken: shortLivedToken,
        expiresIn: data.expires_in,
      };
    }

    const longLivedData = (await longLivedResponse.json()) as ThreadsLongLivedTokenResponse;

    return {
      accessToken: longLivedData.access_token,
      expiresIn: longLivedData.expires_in,
    };
  }

  async authenticate(code: string): Promise<SocialAccount> {
    const tokenData = await this.exchangeCodeForToken(code);

    const profile = await this._request<{ id: string; username: string }>(
      'GET',
      `/me?fields=id,username`,
      undefined,
      { ...this.createAccount(tokenData, '', ''), accessToken: tokenData.accessToken },
    );

    return this.createAccount(
      tokenData,
      profile.id,
      profile.username,
      { isProfessional: true },
    );
  }

  async refreshToken(account: SocialAccount): Promise<SocialAccount> {
    if (!account.refreshToken && !account.accessToken) {
      throw new AuthenticationError(this.platform, 'No token available to refresh');
    }

    const params = new URLSearchParams({
      grant_type: 'th_refresh_token',
      access_token: account.accessToken,
    });

    const response = await fetch(
      `https://graph.threads.net/refresh_access_token?${params.toString()}`,
      { method: 'GET', headers: { Accept: 'application/json' } },
    );

    if (!response.ok) {
      throw new AuthenticationError(this.platform, 'Failed to refresh Threads access token');
    }

    const data = (await response.json()) as ThreadsRefreshTokenResponse;
    const now = new Date();

    return {
      ...account,
      accessToken: data.access_token,
      tokenExpiresAt: new Date(now.getTime() + data.expires_in * 1000),
      updatedAt: now,
    };
  }

  // ─── Profile ──────────────────────────────────────────────────────────────

  async getProfile(account: SocialAccount): Promise<ThreadsUserProfile> {
    const fields = [
      'id',
      'username',
      'threads_profile_picture_url',
      'threads_biography',
      'follower_count',
      'following_count',
      'likes_count',
      'replies_count',
      'reposts_count',
    ].join(',');

    return this._request<ThreadsUserProfile>(
      'GET',
      `/me?fields=${fields}`,
      undefined,
      account,
    );
  }

  // ─── Publish Post ─────────────────────────────────────────────────────────

  async publishPost(account: SocialAccount, options: SocialPublishOptions): Promise<SocialPost> {
    const threadsUserId = account.platformAccountId;
    const hasMedia = options.mediaUrls && options.mediaUrls.length > 0;

    if (hasMedia) {
      return this.publishMediaPost(account, threadsUserId, options);
    }

    return this.publishTextPost(account, threadsUserId, options);
  }

  private async publishTextPost(
    account: SocialAccount,
    threadsUserId: string,
    options: SocialPublishOptions,
  ): Promise<SocialPost> {
    const container = await this._request<ThreadsMediaContainerResponse>(
      'POST',
      `/${threadsUserId}/threads`,
      {
        media_type: 'TEXT',
        text: options.content,
        access_token: account.accessToken,
      },
      account,
    );

    const published = await this.publishContainer(container.id, account);

    return this.createPost(account.id, options.content, published.id);
  }

  private async publishMediaPost(
    account: SocialAccount,
    threadsUserId: string,
    options: SocialPublishOptions,
  ): Promise<SocialPost> {
    const mediaUrl = options.mediaUrls![0];
    const isVideo = mediaUrl.endsWith('.mp4') || mediaUrl.endsWith('.mov') || mediaUrl.endsWith('.avi');
    const mediaType = isVideo ? 'VIDEO' : 'IMAGE';

    const createBody: Record<string, unknown> = {
      media_type: mediaType,
      [isVideo ? 'video_url' : 'image_url']: mediaUrl,
      access_token: account.accessToken,
    };

    if (options.content) {
      createBody.text = options.content;
    }

    const container = await this._request<ThreadsMediaContainerResponse>(
      'POST',
      `/${threadsUserId}/threads`,
      createBody,
      account,
    );

    if (isVideo) {
      await this.waitForMediaProcessing(container.id, account);
    }

    const published = await this.publishContainer(container.id, account);

    return this.createPost(account.id, options.content, published.id, options.mediaUrls);
  }

  private async publishContainer(
    containerId: string,
    account: SocialAccount,
  ): Promise<ThreadsMediaPublishResponse> {
    const result = await this._request<ThreadsMediaPublishResponse>(
      'POST',
      `/${containerId}/threads/publish`,
      { access_token: account.accessToken },
      account,
    );

    return result;
  }

  private async waitForMediaProcessing(
    containerId: string,
    account: SocialAccount,
  ): Promise<void> {
    const maxAttempts = 60;
    const pollIntervalMs = 5000;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      await this.delay(pollIntervalMs);

      const status = await this._request<{ status_code: string }>(
        'GET',
        `/${containerId}?fields=status_code`,
        undefined,
        account,
      );

      if (status.status_code === 'FINISHED') {
        return;
      }

      if (status.status_code === 'ERROR' || status.status_code === 'EXPIRED') {
        throw new SocialError(
          `Threads media processing failed with status: ${status.status_code}`,
          this.platform,
          'MEDIA_PROCESSING_FAILED',
          undefined,
          false,
        );
      }
    }

    throw new SocialError(
      'Threads media processing timed out',
      this.platform,
      'MEDIA_PROCESSING_TIMEOUT',
      undefined,
      true,
    );
  }

  // ─── Delete Post ──────────────────────────────────────────────────────────

  async deletePost(account: SocialAccount, postId: string): Promise<void> {
    await this._request<{ success: boolean }>(
      'DELETE',
      `/${postId}`,
      undefined,
      account,
    );
  }

  // ─── Analytics ────────────────────────────────────────────────────────────

  async getAnalytics(account: SocialAccount, period: { start: Date; end: Date }): Promise<SocialAnalytics> {
    const threadsUserId = account.platformAccountId;

    const [profileData, insights] = await Promise.all([
      this._request<ThreadsUserProfile>(
        'GET',
        `/me?fields=follower_count,following_count,replies_count,reposts_count`,
        undefined,
        account,
      ),
      this._request<{ data: ThreadsInsight[] }>(
        'GET',
        `/${threadsUserId}/threads/insights?metric=views,likes,replies,reposts&since=${Math.floor(period.start.getTime() / 1000)}&until=${Math.floor(period.end.getTime() / 1000)}`,
        undefined,
        account,
      ).catch(() => ({ data: [] as ThreadsInsight[] })),
    ]);

    let impressions = 0;
    let likes = 0;
    let replies = 0;
    let reposts = 0;

    for (const insight of insights.data) {
      const latestValue = insight.values[insight.values.length - 1];
      if (!latestValue) continue;

      const numValue = typeof latestValue.value === 'number' ? latestValue.value : parseInt(String(latestValue.value), 10) || 0;

      if (insight.name === 'views') impressions = numValue;
      if (insight.name === 'likes') likes = numValue;
      if (insight.name === 'replies') replies = numValue;
      if (insight.name === 'reposts') reposts = numValue;
    }

    const followers = profileData.follower_count ?? 0;
    const following = profileData.following_count ?? 0;
    const totalEngagement = likes + replies + reposts;
    const engagementRate = impressions > 0 ? (totalEngagement / impressions) * 100 : 0;

    return {
      followers,
      following,
      postsCount: profileData.replies_count ?? 0,
      engagementRate: Math.round(engagementRate * 100) / 100,
      reach: Math.floor(impressions * 0.8),
      impressions,
      period,
    };
  }

  // ─── Comments (Replies in Threads) ────────────────────────────────────────

  async getComments(account: SocialAccount, postId: string): Promise<SocialComment[]> {
    const replies = await this.fetchAllPaginated<ThreadsReply>(
      `/${postId}/replies?fields=id,text,username,timestamp,like_count,reply_count,permalink&limit=100`,
      account,
    );

    return replies.map((reply) => ({
      id: reply.id,
      postId,
      platform: this.platform,
      authorName: reply.username || 'unknown',
      authorUsername: reply.username || reply.id,
      content: reply.text || '[Media]',
      createdAt: reply.timestamp ? new Date(reply.timestamp) : new Date(),
      isReply: (reply.reply_count ?? 0) > 0,
    }));
  }

  async replyToComment(account: SocialAccount, commentId: string, content: string): Promise<SocialComment> {
    const result = await this._request<ThreadsMediaContainerResponse>(
      'POST',
      `/${account.platformAccountId}/threads`,
      {
        media_type: 'TEXT',
        text: content,
        reply_to_id: commentId,
        access_token: account.accessToken,
      },
      account,
    );

    await this.publishContainer(result.id, account);

    return {
      id: result.id,
      postId: commentId,
      platform: this.platform,
      authorName: account.platformUsername,
      authorUsername: account.platformAccountId,
      content,
      createdAt: new Date(),
      isReply: true,
    };
  }

  // ─── Messages (DMs) ───────────────────────────────────────────────────────

  async getMessages(account: SocialAccount, conversationId?: string): Promise<SocialMessage[]> {
    if (conversationId) {
      return this.getConversationMessages(account, conversationId);
    }

    const conversations = await this._request<{ data: ThreadsConversation[] }>(
      'GET',
      `/me/conversations?fields=id,participants,last_message_at&limit=25`,
      undefined,
      account,
    ).catch(() => ({ data: [] as ThreadsConversation[] }));

    const allMessages: SocialMessage[] = [];
    for (const conv of conversations.data.slice(0, 5)) {
      const messages = await this.getConversationMessages(account, conv.id);
      allMessages.push(...messages);
    }

    return allMessages;
  }

  private async getConversationMessages(
    account: SocialAccount,
    conversationId: string,
  ): Promise<SocialMessage[]> {
    const messages = await this.fetchAllPaginated<ThreadsMessageItem>(
      `/${conversationId}/messages?fields=id,text,from,timestamp,media_type,media_url&limit=50`,
      account,
    );

    return messages.map((msg) => {
      const isInbound = msg.from?.id !== account.platformAccountId;

      return {
        id: msg.id,
        accountId: account.id,
        platform: this.platform,
        conversationId,
        direction: isInbound ? 'inbound' : 'outbound',
        content: msg.text || '[Media]',
        mediaUrl: msg.media_url,
        senderName: msg.from?.username || 'unknown',
        senderId: msg.from?.id || '',
        createdAt: msg.timestamp ? new Date(msg.timestamp) : new Date(),
        isRead: !isInbound,
      };
    });
  }

  async sendMessage(
    account: SocialAccount,
    conversationId: string,
    content: string,
    mediaUrl?: string,
  ): Promise<SocialMessage> {
    const containerBody: Record<string, unknown> = {
      media_type: 'TEXT',
      text: content,
      access_token: account.accessToken,
    };

    if (mediaUrl) {
      containerBody.media_type = mediaUrl.endsWith('.mp4') || mediaUrl.endsWith('.mov') ? 'VIDEO' : 'IMAGE';
      containerBody[containerBody.media_type === 'VIDEO' ? 'video_url' : 'image_url'] = mediaUrl;
      containerBody.recipient_id = conversationId;
    }

    const container = await this._request<ThreadsMediaContainerResponse>(
      'POST',
      `/${account.platformAccountId}/threads`,
      containerBody,
      account,
    );

    await this.publishContainer(container.id, account);

    return {
      id: container.id,
      accountId: account.id,
      platform: this.platform,
      conversationId,
      direction: 'outbound',
      content,
      mediaUrl,
      senderName: account.platformUsername,
      senderId: account.platformAccountId,
      createdAt: new Date(),
      isRead: true,
    };
  }

  // ─── Webhooks ─────────────────────────────────────────────────────────────

  verifyWebhook(payload: SocialWebhookPayload, signature: string): boolean {
    if (!this.config.clientSecret) return false;

    const expected = crypto
      .createHmac('sha256', this.config.clientSecret)
      .update(JSON.stringify(payload.data))
      .digest('hex');

    try {
      return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
    } catch {
      return false;
    }
  }

  async handleWebhook(payload: SocialWebhookPayload): Promise<void> {
    this.logger.info('Processing Threads webhook', {
      event: payload.event,
      timestamp: payload.timestamp,
    });

    if (payload.event === 'threads_reply') {
      this.logger.info('Threads reply received', { data: payload.data });
    }

    if (payload.event === 'threads_follow') {
      this.logger.info('Threads follow event', { data: payload.data });
    }

    if (payload.event === 'threads_like') {
      this.logger.info('Threads like event', { data: payload.data });
    }

    if (payload.event === 'threads_repost') {
      this.logger.info('Threads repost event', { data: payload.data });
    }
  }

  // ─── Additional Threads-specific Methods ──────────────────────────────────

  async getUserPosts(
    account: SocialAccount,
    limit: number = 25,
  ): Promise<ThreadsMediaItem[]> {
    return this.fetchAllPaginated<ThreadsMediaItem>(
      `/me/threads?fields=id,text,media_type,media_url,permalink,timestamp,like_count,reply_count,repost_count,views_count&limit=${limit}`,
      account,
    );
  }

  async getPostReplies(
    account: SocialAccount,
    postId: string,
    limit: number = 100,
  ): Promise<ThreadsReply[]> {
    return this.fetchAllPaginated<ThreadsReply>(
      `/${postId}/replies?fields=id,text,username,timestamp,like_count,reply_count,media_type,media_url,permalink&limit=${limit}`,
      account,
    );
  }

  async likePost(account: SocialAccount, postId: string): Promise<void> {
    await this._request<{ success: boolean }>(
      'POST',
      `/${postId}/like`,
      { access_token: account.accessToken },
      account,
    );
  }

  async unlikePost(account: SocialAccount, postId: string): Promise<void> {
    await this._request<{ success: boolean }>(
      'DELETE',
      `/${postId}/like`,
      undefined,
      account,
    );
  }

  async repostThread(account: SocialAccount, postId: string): Promise<void> {
    await this._request<{ success: boolean }>(
      'POST',
      `/${account.platformAccountId}/repost`,
      {
        media_type: 'REPOST',
        repost_media_id: postId,
        access_token: account.accessToken,
      },
      account,
    );
  }

  // ─── Protected Helpers ────────────────────────────────────────────────────

  protected isTokenExpired(account: SocialAccount): boolean {
    if (!account.tokenExpiresAt) return false;
    return Date.now() >= account.tokenExpiresAt.getTime() - 300_000;
  }

  protected buildAuthHeaders(account: SocialAccount): Record<string, string> {
    return { Authorization: `Bearer ${account.accessToken}` };
  }

  protected extractRateLimitInfo(response: Response): { resetAt?: Date; limit?: number } | null {
    const xAppUsage = response.headers.get('x-app-usage');
    if (xAppUsage) {
      try {
        const parsed = JSON.parse(xAppUsage);
        return {
          limit: parsed.call_count ?? 200,
          resetAt: new Date(Date.now() + 60 * 60 * 1000),
        };
      } catch {
        // ignore parse errors
      }
    }

    if (response.status === 429) {
      return {
        resetAt: new Date(Date.now() + 60 * 60 * 1000),
        limit: 200,
      };
    }

    return null;
  }

  protected extractErrorData(errorBody: string): {
    message: string;
    code: string;
    statusCode: number;
    retryable: boolean;
  } {
    try {
      const data = JSON.parse(errorBody) as {
        error?: {
          message: string;
          code: number;
          type: string;
          error_subcode?: number;
          is_transient?: boolean;
        };
      };

      if (data.error) {
        return {
          message: data.error.message,
          code: data.error.type || `THREADS_ERR_${data.error.code}`,
          statusCode: data.error.code === 190 ? 401 : data.error.code === 4 ? 429 : 500,
          retryable: data.error.is_transient === true || data.error.code === 2 || data.error.code === 4,
        };
      }
    } catch {
      // ignore parse errors
    }

    return { message: errorBody, code: 'UNKNOWN', statusCode: 500, retryable: false };
  }
}