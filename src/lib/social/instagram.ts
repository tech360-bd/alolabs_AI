// ALO Labs AIOS — Instagram Graph API v18.0 Provider

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

const GRAPH_API_VERSION = 'v18.0';

// ─── Instagram Graph API Response Types ────────────────────────────────────────

interface InstagramTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

interface InstagramLongLivedTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

interface InstagramUserFields {
  id: string;
  username: string;
  name?: string;
  account_type?: string;
  followers_count?: number;
  follows_count?: number;
  media_count?: number;
  profile_picture_url?: string;
}

interface InstagramMediaContainerResponse {
  id: string;
  status_code?: string;
}

interface InstagramMediaPublishResponse {
  id: string;
}

interface InstagramInsight {
  name: string;
  period: string;
  values: { value: number | string; end_time: string }[];
}

interface InstagramMediaItem {
  id: string;
  caption?: string;
  media_type?: string;
  permalink?: string;
  timestamp?: string;
  like_count?: number;
  comments_count?: number;
  share_count?: number;
  impression_count?: number;
  reach?: number;
  engagement?: number;
  saved?: number;
  video_view_count?: number;
}

interface InstagramCommentItem {
  id: string;
  text: string;
  username: string;
  timestamp: string;
  replies?: { data: InstagramCommentItem[] };
  parent_id?: string;
}

interface InstagramConversationItem {
  id: string;
  participants: { data: Array<{ id: string; username: string; name?: string }> };
  messages?: { data: Array<{ id: string; message: string; from: { id: string; name: string }; created_time: string }> };
}

// ─── Instagram Provider ────────────────────────────────────────────────────────

export class InstagramProvider extends BaseSocialProvider {
  readonly platform: SocialPlatform = 'instagram';

  constructor(config: OAuthConfig, logger?: Logger) {
    super({
      ...config,
      authUrl: config.authUrl || `https://www.facebook.com/${GRAPH_API_VERSION}/dialog/oauth`,
      tokenUrl: config.tokenUrl || `https://graph.facebook.com/${GRAPH_API_VERSION}/oauth/access_token`,
      apiUrl: config.apiUrl || `https://graph.facebook.com/${GRAPH_API_VERSION}`,
    }, logger);
  }

  // ─── OAuth2 Authorization URL ──────────────────────────────────────────────

  generateAuthUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      scope: this.config.scopes.join(','),
      state,
      response_type: 'code',
      config_id: '', // Instagram app-scoped user ID can be used here
    });
    return `${this.config.authUrl}?${params.toString()}`;
  }

  // ─── Token Exchange ────────────────────────────────────────────────────────

  protected async exchangeCodeForToken(code: string): Promise<{
    accessToken: string;
    refreshToken?: string;
    expiresIn?: number;
  }> {
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      redirect_uri: this.config.redirectUri,
      code,
    });

    const response = await fetch(`${this.config.tokenUrl}?${params.toString()}`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new AuthenticationError('instagram', `Failed to exchange code for token: ${errorBody}`);
    }

    const data = (await response.json()) as InstagramTokenResponse & { error?: { message: string; code: number } };
    if (data.error) {
      throw new AuthenticationError('instagram', data.error.message);
    }

    // Exchange short-lived token for a long-lived token
    const longLivedParams = new URLSearchParams({
      grant_type: 'fb_exchange_token',
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      fb_exchange_token: data.access_token,
    });

    const longLivedResponse = await fetch(
      `https://graph.facebook.com/${GRAPH_API_VERSION}/oauth/access_token?${longLivedParams.toString()}`,
      { method: 'GET', headers: { Accept: 'application/json' } },
    );

    if (!longLivedResponse.ok) {
      // Fall back to short-lived token if long-lived exchange fails
      return {
        accessToken: data.access_token,
        expiresIn: data.expires_in,
      };
    }

    const longLivedData = (await longLivedResponse.json()) as InstagramLongLivedTokenResponse;
    return {
      accessToken: longLivedData.access_token,
      refreshToken: data.access_token, // Keep short-lived token for future refresh
      expiresIn: longLivedData.expires_in,
    };
  }

  // ─── Authenticate ──────────────────────────────────────────────────────────

  async authenticate(code: string): Promise<SocialAccount> {
    const tokenData = await this.exchangeCodeForToken(code);

    // First get the Facebook user to find connected Instagram account
    const meData = await this._request<{
      id: string;
      name: string;
    }>('GET', '/me', undefined).catch(() => null);

    // Get Instagram business account linked to the Facebook user
    let igUserId: string | null = null;
    let igUsername: string = 'unknown';

    if (meData) {
      try {
        const accountsData = await this._request<{
          instagram_business_account?: { id: string };
        }>('GET', `/me/accounts?fields=instagram_business_account&access_token=${tokenData.accessToken}`);

        if (accountsData.instagram_business_account) {
          igUserId = accountsData.instagram_business_account.id;
        }
      } catch {
        // Try getting IG user ID directly
      }
    }

    // If we have an IG user ID, fetch their profile
    if (igUserId) {
      try {
        const igUser = await this._request<InstagramUserFields>(
          'GET',
          `/${igUserId}?fields=id,username,name,account_type,followers_count,follows_count,media_count,profile_picture_url`,
          undefined,
        );
        igUsername = igUser.username || igUsername;

        return this.createAccount(tokenData, igUserId, igUsername, {
          igUserId,
          igUsername: igUser.username,
          name: igUser.name,
          accountType: igUser.account_type,
          followersCount: igUser.followers_count,
          followsCount: igUser.follows_count,
          mediaCount: igUser.media_count,
          profilePictureUrl: igUser.profile_picture_url,
        });
      } catch {
        // Fall through to create with available data
      }
    }

    return this.createAccount(tokenData, meData?.id || 'unknown', igUsername, {
      igUserId: igUserId || undefined,
    });
  }

  // ─── Token Refresh ─────────────────────────────────────────────────────────

  async refreshToken(account: SocialAccount): Promise<SocialAccount> {
    if (!account.refreshToken) {
      throw new AuthenticationError('instagram', 'No refresh token available');
    }

    const params = new URLSearchParams({
      grant_type: 'fb_exchange_token',
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      fb_exchange_token: account.refreshToken,
    });

    const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/oauth/access_token?${params.toString()}`;
    const response = await fetch(url, { method: 'GET', headers: { Accept: 'application/json' } });

    if (!response.ok) {
      throw new AuthenticationError('instagram', 'Failed to refresh Instagram token');
    }

    const data = (await response.json()) as InstagramLongLivedTokenResponse;
    const now = new Date();

    return {
      ...account,
      accessToken: data.access_token,
      tokenExpiresAt: new Date(now.getTime() + data.expires_in * 1000),
      updatedAt: now,
    };
  }

  // ─── Media Publishing ──────────────────────────────────────────────────────

  async publishPost(account: SocialAccount, options: SocialPublishOptions): Promise<SocialPost> {
    const igUserId = account.metadata?.igUserId as string | undefined
      || account.platformAccountId;

    if (!igUserId) {
      throw new SocialError('Instagram user ID not found', 'instagram', 'IG_USER_NOT_FOUND');
    }

    if (!options.mediaUrls || options.mediaUrls.length === 0) {
      throw new SocialError('Instagram posts require at least one media URL', 'instagram', 'MEDIA_REQUIRED');
    }

    // Determine media type
    const firstMedia = options.mediaUrls[0];
    const isVideo = /\.mp4|\.mov/i.test(firstMedia);
    const isReel = isVideo; // Reels are published the same way as videos in IG Graph API

    const mediaContainerIds: string[] = [];

    for (const mediaUrl of options.mediaUrls) {
      const mediaIsVideo = /\.mp4|\.mov/i.test(mediaUrl);

      const createBody: Record<string, unknown> = {
        access_token: account.accessToken,
        caption: options.content,
      };

      if (mediaIsVideo) {
        createBody.media_type = 'REELS';
        createBody.video_url = mediaUrl;
      } else {
        createBody.image_url = mediaUrl;
      }

      const container = await this._request<InstagramMediaContainerResponse>(
        'POST',
        `/${igUserId}/media`,
        createBody,
        account,
      );

      mediaContainerIds.push(container.id);

      // For videos/reels, wait for processing
      if (mediaIsVideo) {
        await this.waitForMediaProcessing(container.id, account);
      }
    }

    // Publish the media container
    const result = await this._request<InstagramMediaPublishResponse>(
      'POST',
      `/${igUserId}/media_publish`,
      {
        creation_id: mediaContainerIds[0],
        access_token: account.accessToken,
      },
      account,
    );

    return this.createPost(account.id, options.content, result.id, options.mediaUrls);
  }

  // ─── Stories ───────────────────────────────────────────────────────────────

  async publishStory(account: SocialAccount, mediaUrl: string, stickerUrl?: string): Promise<SocialPost> {
    const igUserId = account.metadata?.igUserId as string | undefined
      || account.platformAccountId;

    if (!igUserId) {
      throw new SocialError('Instagram user ID not found', 'instagram', 'IG_USER_NOT_FOUND');
    }

    const isVideo = /\.mp4|\.mov/i.test(mediaUrl);

    const createBody: Record<string, unknown> = {
      access_token: account.accessToken,
      media_type: isVideo ? 'VIDEO' : 'IMAGE',
    };

    if (isVideo) {
      createBody.video_url = mediaUrl;
    } else {
      createBody.image_url = mediaUrl;
    }

    const container = await this._request<InstagramMediaContainerResponse>(
      'POST',
      `/${igUserId}/media`,
      createBody,
      account,
    );

    if (isVideo) {
      await this.waitForMediaProcessing(container.id, account);
    }

    // Publish the story container
    const result = await this._request<InstagramMediaPublishResponse>(
      'POST',
      `/${igUserId}/media_publish`,
      {
        creation_id: container.id,
        access_token: account.accessToken,
      },
      account,
    );

    return this.createPost(account.id, '[Story]', result.id, [mediaUrl]);
  }

  // ─── Reels ─────────────────────────────────────────────────────────────────

  async publishReel(account: SocialAccount, videoUrl: string, caption: string, shareToFeed: boolean = true): Promise<SocialPost> {
    const igUserId = account.metadata?.igUserId as string | undefined
      || account.platformAccountId;

    if (!igUserId) {
      throw new SocialError('Instagram user ID not found', 'instagram', 'IG_USER_NOT_FOUND');
    }

    const createBody: Record<string, unknown> = {
      access_token: account.accessToken,
      media_type: 'REELS',
      video_url: videoUrl,
      caption,
      share_to_feed: shareToFeed,
    };

    const container = await this._request<InstagramMediaContainerResponse>(
      'POST',
      `/${igUserId}/media`,
      createBody,
      account,
    );

    await this.waitForMediaProcessing(container.id, account);

    const result = await this._request<InstagramMediaPublishResponse>(
      'POST',
      `/${igUserId}/media_publish`,
      {
        creation_id: container.id,
        access_token: account.accessToken,
      },
      account,
    );

    return this.createPost(account.id, caption, result.id, [videoUrl]);
  }

  // ─── Delete Post ───────────────────────────────────────────────────────────

  async deletePost(account: SocialAccount, postId: string): Promise<void> {
    await this._request<{ success: boolean }>('DELETE', `/${postId}`, undefined, account);
  }

  // ─── Analytics ─────────────────────────────────────────────────────────────

  async getAnalytics(account: SocialAccount, period: { start: Date; end: Date }): Promise<SocialAnalytics> {
    const igUserId = account.metadata?.igUserId as string | undefined
      || account.platformAccountId;

    if (!igUserId) {
      throw new SocialError('Instagram user ID not found', 'instagram', 'IG_USER_NOT_FOUND');
    }

    const since = Math.floor(period.start.getTime() / 1000);
    const until = Math.floor(period.end.getTime() / 1000);

    const [userFields, insights] = await Promise.all([
      this._request<InstagramUserFields>(
        'GET',
        `/${igUserId}?fields=id,username,name,followers_count,follows_count,media_count`,
        undefined,
        account,
      ),
      this._request<{ data: InstagramInsight[] }>(
        'GET',
        `/${igUserId}/insights?metric=impressions,reach,engagement,follower_count,comments,likes,saves,shares&period=day&since=${since}&until=${until}`,
        undefined,
        account,
      ).catch(() => ({ data: [] as InstagramInsight[] })),
    ]);

    let impressions = 0;
    let reach = 0;
    let engagement = 0;
    let followers = userFields.followers_count || 0;
    let following = userFields.follows_count || 0;

    for (const insight of insights.data) {
      const total = insight.values.reduce((sum, v) => {
        return sum + (typeof v.value === 'number' ? v.value : 0);
      }, 0);

      switch (insight.name) {
        case 'impressions':
          impressions = total;
          break;
        case 'reach':
          reach = total;
          break;
        case 'engagement':
          engagement = total;
          break;
        case 'follower_count':
          followers = total;
          break;
      }
    }

    const engagementRate = reach > 0 ? (engagement / reach) * 100 : 0;

    return {
      followers,
      following,
      postsCount: userFields.media_count || 0,
      engagementRate: Math.round(engagementRate * 100) / 100,
      reach,
      impressions,
      period,
    };
  }

  // ─── Post-Level Analytics ──────────────────────────────────────────────────

  async getPostAnalytics(postId: string, account: SocialAccount): Promise<{
    impressions: number;
    reach: number;
    engagement: number;
    likes: number;
    comments: number;
    shares: number;
    saved: number;
    videoViews?: number;
  }> {
    const insights = await this._request<{ data: InstagramInsight[] }>(
      'GET',
      `/${postId}/insights?metric=impressions,reach,engagement,likes,comments,shares,saved,video_views`,
      undefined,
      account,
    ).catch(() => ({ data: [] as InstagramInsight[] }));

    const metrics: Record<string, number> = {};
    for (const insight of insights.data) {
      const latest = insight.values[insight.values.length - 1];
      if (latest && typeof latest.value === 'number') {
        metrics[insight.name] = latest.value;
      }
    }

    return {
      impressions: metrics['impressions'] ?? 0,
      reach: metrics['reach'] ?? 0,
      engagement: metrics['engagement'] ?? 0,
      likes: metrics['likes'] ?? 0,
      comments: metrics['comments'] ?? 0,
      shares: metrics['shares'] ?? 0,
      saved: metrics['saved'] ?? 0,
      videoViews: metrics['video_views'] ?? undefined,
    };
  }

  // ─── Comments ──────────────────────────────────────────────────────────────

  async getComments(account: SocialAccount, postId: string): Promise<SocialComment[]> {
    const igUserId = account.metadata?.igUserId as string | undefined
      || account.platformAccountId;

    const result = await this.fetchAllPaginated<InstagramCommentItem>(
      `/${postId}/comments?fields=id,text,username,timestamp,replies{id,text,username,timestamp},parent_id&limit=100`,
      account,
    );

    const comments: SocialComment[] = [];

    for (const c of result) {
      comments.push({
        id: c.id,
        postId,
        platform: 'instagram' as SocialPlatform,
        authorName: c.username,
        authorUsername: c.username,
        content: c.text,
        createdAt: new Date(Number(c.timestamp) * 1000),
        isReply: !!c.parent_id,
      });

      // Include replies
      if (c.replies?.data) {
        for (const reply of c.replies.data) {
          comments.push({
            id: reply.id,
            postId,
            platform: 'instagram' as SocialPlatform,
            authorName: reply.username,
            authorUsername: reply.username,
            content: reply.text,
            createdAt: new Date(Number(reply.timestamp) * 1000),
            isReply: true,
          });
        }
      }
    }

    return comments;
  }

  async replyToComment(account: SocialAccount, commentId: string, content: string): Promise<SocialComment> {
    const result = await this._request<{ id: string; text: string }>(
      'POST',
      `/${commentId}/replies`,
      { message: content },
      account,
    );

    return {
      id: result.id,
      postId: commentId,
      platform: 'instagram',
      authorName: account.platformUsername,
      authorUsername: account.platformUsername,
      content,
      createdAt: new Date(),
      isReply: true,
    };
  }

  // ─── Messages (Instagram DMs via Messenger) ────────────────────────────────

  async getMessages(account: SocialAccount, conversationId?: string): Promise<SocialMessage[]> {
    if (!conversationId) {
      return [];
    }

    const result = await this.fetchAllPaginated<{
      id: string;
      message: string;
      from: { id: string; name: string };
      created_time: string;
    }>(
      `/${conversationId}/messages?fields=id,message,from,created_time&limit=50`,
      account,
    );

    const igUserId = account.metadata?.igUserId as string | undefined
      || account.platformAccountId;

    return result.map((m) => ({
      id: m.id,
      accountId: account.id,
      platform: 'instagram' as SocialPlatform,
      conversationId,
      direction: m.from.id !== igUserId ? 'inbound' : 'outbound',
      content: m.message,
      senderName: m.from.name,
      senderId: m.from.id,
      createdAt: new Date(m.created_time),
      isRead: m.from.id === igUserId,
    }));
  }

  async sendMessage(account: SocialAccount, conversationId: string, content: string, mediaUrl?: string): Promise<SocialMessage> {
    const body: Record<string, unknown> = { message: content };

    if (mediaUrl) {
      body.attachment = {
        type: 'image',
        payload: { url: mediaUrl, is_reusable: true },
      };
    }

    const result = await this._request<{ id: string; message: string }>(
      'POST',
      `/${conversationId}/messages`,
      body,
      account,
    );

    return {
      id: result.id,
      accountId: account.id,
      platform: 'instagram',
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

  // ─── Account Info ──────────────────────────────────────────────────────────

  async getAccountInfo(account: SocialAccount): Promise<InstagramUserFields> {
    const igUserId = account.metadata?.igUserId as string | undefined
      || account.platformAccountId;

    if (!igUserId) {
      throw new SocialError('Instagram user ID not found', 'instagram', 'IG_USER_NOT_FOUND');
    }

    return this._request<InstagramUserFields>(
      'GET',
      `/${igUserId}?fields=id,username,name,account_type,followers_count,follows_count,media_count,profile_picture_url`,
      undefined,
      account,
    );
  }

  // ─── Webhook Verification ──────────────────────────────────────────────────

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
    this.logger.info('Processing Instagram webhook', {
      event: payload.event,
      timestamp: payload.timestamp,
    });

    if (payload.event === 'comments' || payload.event === 'mentions') {
      this.logger.info('Instagram comment/mention webhook received', { event: payload.event });
    }

    if (payload.event === 'messages') {
      this.logger.info('Instagram DM webhook received');
    }
  }

  // ─── Protected Helpers (BaseSocialProvider requirements) ───────────────────

  protected isTokenExpired(account: SocialAccount): boolean {
    if (!account.tokenExpiresAt) return false;
    return Date.now() >= account.tokenExpiresAt.getTime() - 300_000; // 5 min buffer
  }

  protected buildAuthHeaders(account: SocialAccount): Record<string, string> {
    return { Authorization: `Bearer ${account.accessToken}` };
  }

  protected extractRateLimitInfo(response: Response): { resetAt?: Date; limit?: number } | null {
    const usage = response.headers.get('x-app-usage');
    if (usage) {
      try {
        const parsed = JSON.parse(usage);
        return {
          limit: parsed.call_count ?? 0,
          resetAt: new Date(Date.now() + 60 * 60 * 1000),
        };
      } catch {
        // ignore parse errors
      }
    }
    return null;
  }

  protected extractErrorData(errorBody: string): { message: string; code: string; statusCode: number; retryable: boolean } {
    try {
      const data = JSON.parse(errorBody) as {
        error?: { message: string; code: number; type: string; error_subcode?: number; is_transient?: boolean };
      };
      if (data.error) {
        return {
          message: data.error.message,
          code: data.error.type || `ERR_${data.error.code}`,
          statusCode: data.error.code === 190 ? 401 : 500,
          retryable: data.error.is_transient === true || data.error.code === 2 || data.error.code === 4,
        };
      }
    } catch {
      // ignore parse errors
    }
    return { message: errorBody, code: 'UNKNOWN', statusCode: 500, retryable: false };
  }

  // ─── Private Helpers ───────────────────────────────────────────────────────

  private async waitForMediaProcessing(containerId: string, account: SocialAccount): Promise<void> {
    const maxChecks = 60;
    const checkInterval = 5000;
    let status = 'IN_PROGRESS';

    for (let i = 0; i < maxChecks; i++) {
      await this.delay(checkInterval);

      try {
        const statusCheck = await this._request<{ status_code: string }>(
          'GET',
          `/${containerId}?fields=status_code`,
          undefined,
          account,
        );
        status = statusCheck.status_code;
      } catch {
        // Continue checking
      }

      if (status === 'FINISHED') return;
      if (status === 'ERROR') {
        throw new SocialError(
          `Instagram media processing failed for container ${containerId}`,
          'instagram',
          'MEDIA_PROCESSING_FAILED',
          undefined,
          false,
        );
      }
    }

    throw new SocialError(
      `Instagram media processing timed out for container ${containerId}`,
      'instagram',
      'MEDIA_PROCESSING_TIMEOUT',
      undefined,
      false,
    );
  }
}