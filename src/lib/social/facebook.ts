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

const GRAPH_API_VERSION = 'v19.0';

interface FacebookTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
}

interface FacebookPage {
  id: string;
  name: string;
  access_token: string;
  category?: string;
}

interface FacebookPostResponse {
  id: string;
  message?: string;
  created_time?: string;
  permalink_url?: string;
}

interface FacebookCommentResponse {
  id: string;
  message: string;
  from: { id: string; name: string };
  created_time: string;
  parent?: { id: string };
  comment_count?: number;
}

interface FacebookMessageResponse {
  id: string;
  message: string;
  from: { id: string; name: string };
  created_time: string;
  attachments?: { data: { image_data?: { url: string }; file_url?: string }[] };
}

interface FacebookInsight {
  name: string;
  period: string;
  values: { value: number | { shares: number; comments: number; likes: number }; end_time: string }[];
}

interface FacebookConversation {
  id: string;
  snippet?: string;
  updated_time: string;
  participants: { data: { id: string; name: string }[] };
  messages?: { data: FacebookMessageResponse[] };
}

export class FacebookProvider extends BaseSocialProvider {
  readonly platform: SocialPlatform = 'facebook';

  constructor(config: OAuthConfig, logger?: Logger) {
    super({
      ...config,
      authUrl: config.authUrl || `https://www.facebook.com/${GRAPH_API_VERSION}/dialog/oauth`,
      tokenUrl: config.tokenUrl || `https://graph.facebook.com/${GRAPH_API_VERSION}/oauth/access_token`,
      apiUrl: config.apiUrl || `https://graph.facebook.com/${GRAPH_API_VERSION}`,
    }, logger);
  }

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
      throw new AuthenticationError('facebook', `Failed to exchange code for token: ${errorBody}`);
    }

    const data = (await response.json()) as FacebookTokenResponse & { error?: { message: string; code: number } };
    if (data.error) {
      throw new AuthenticationError('facebook', data.error.message);
    }

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in,
    };
  }

  async authenticate(code: string): Promise<SocialAccount> {
    const tokenData = await this.exchangeCodeForToken(code);

    const meData = await this._request<{
      id: string;
      name: string;
    }>('GET', '/me', undefined).catch(() => null);

    if (meData) {
      return this.createAccount(tokenData, meData.id, meData.name);
    }

    const pages = await this._request<{ data: FacebookPage[] }>(
      'GET',
      `/me/accounts?access_token=${tokenData.accessToken}`,
    );

    if (pages.data && pages.data.length > 0) {
      const page = pages.data[0];
      return this.createAccount(
        { accessToken: page.access_token, expiresIn: 5184000 },
        page.id,
        page.name,
        { pageToken: tokenData.accessToken, isPage: true },
      );
    }

    return this.createAccount(tokenData, 'unknown', 'unknown');
  }

  async refreshToken(account: SocialAccount): Promise<SocialAccount> {
    if (!account.refreshToken) {
      throw new AuthenticationError('facebook', 'No refresh token available');
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
      throw new AuthenticationError('facebook', 'Failed to refresh Facebook token');
    }

    const data = (await response.json()) as FacebookTokenResponse;
    const now = new Date();

    return {
      ...account,
      accessToken: data.access_token,
      tokenExpiresAt: new Date(now.getTime() + data.expires_in * 1000),
      updatedAt: now,
    };
  }

  async publishPost(account: SocialAccount, options: SocialPublishOptions): Promise<SocialPost> {
    const pageId = account.platformAccountId;
    const isInstagram = account.metadata?.target === 'instagram';

    if (isInstagram) {
      return this.publishInstagramPost(account, options);
    }

    const body: Record<string, unknown> = { message: options.content };

    if (options.scheduledAt) {
      body.published = false;
      body.scheduled_publish_time = Math.floor(options.scheduledAt.getTime() / 1000);
    }

    if (options.targeting) {
      body.targeting = options.targeting;
    }

    const result = await this._request<FacebookPostResponse>(
      'POST',
      `/${pageId}/feed`,
      body,
      account,
    );

    if (options.mediaUrls && options.mediaUrls.length > 0) {
      for (const mediaUrl of options.mediaUrls) {
        await this._request<{ id: string }>('POST', `/${result.id}/photos`, {
          url: mediaUrl,
        }, account);
      }
    }

    return this.createPost(account.id, options.content, result.id, options.mediaUrls);
  }

  async publishInstagramPost(account: SocialAccount, options: SocialPublishOptions): Promise<SocialPost> {
    const igUserId = account.metadata?.instagramBusinessAccount as string | undefined;
    if (!igUserId) {
      throw new SocialError('Instagram business account ID not found in account metadata', 'facebook', 'INSTAGRAM_NOT_CONFIGURED');
    }

    if (!options.mediaUrls || options.mediaUrls.length === 0) {
      throw new SocialError('Instagram posts require at least one media URL', 'facebook', 'MEDIA_REQUIRED');
    }

    const mediaContainerIds: string[] = [];

    for (const mediaUrl of options.mediaUrls) {
      const isVideo = mediaUrl.endsWith('.mp4') || mediaUrl.endsWith('.mov');

      const createBody: Record<string, unknown> = {
        image_url: mediaUrl,
        caption: options.content,
        access_token: account.accessToken,
      };

      if (isVideo) {
        createBody.media_type = 'REELS';
        createBody.video_url = mediaUrl;
        delete createBody.image_url;
      }

      const container = await this._request<{ id: string }>(
        'POST',
        `/${igUserId}/media`,
        createBody,
        account,
      );

      mediaContainerIds.push(container.id);

      if (isVideo) {
        let status = 'IN_PROGRESS';
        let checks = 0;
        while (status === 'IN_PROGRESS' && checks < 30) {
          await this.delay(5000);
          const statusCheck = await this._request<{ status_code: string }>(
            'GET',
            `/${container.id}?fields=status_code`,
            undefined,
            account,
          );
          status = statusCheck.status_code;
          checks++;
        }

        if (status !== 'FINISHED') {
          throw new SocialError(`Instagram video processing failed with status: ${status}`, 'facebook', 'INSTAGRAM_VIDEO_FAILED');
        }
      }
    }

    const result = await this._request<{ id: string }>(
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

  async deletePost(account: SocialAccount, postId: string): Promise<void> {
    await this._request<{ success: boolean }>('DELETE', `/${postId}`, undefined, account);
  }

  async getAnalytics(account: SocialAccount, period: { start: Date; end: Date }): Promise<SocialAnalytics> {
    const pageId = account.platformAccountId;

    const [pageInsights, postCount] = await Promise.all([
      this._request<{ data: FacebookInsight[] }>(
        'GET',
        `/${pageId}/insights?metric=page_fans,page_follows,page_impressions,page_post_engagements&period=day&since=${Math.floor(period.start.getTime() / 1000)}&until=${Math.floor(period.end.getTime() / 1000)}`,
        undefined,
        account,
      ),
      this._request<{ data: { id: string }[] }>(
        'GET',
        `/${pageId}/posts?fields=id&limit=1&since=${Math.floor(period.start.getTime() / 1000)}&until=${Math.floor(period.end.getTime() / 1000)}`,
        undefined,
        account,
      ).catch(() => ({ data: [] as { id: string }[] })),
    ]);

    let followers = 0;
    let impressions = 0;
    let engagementRate = 0;

    for (const insight of pageInsights.data) {
      const latestValue = insight.values[insight.values.length - 1];
      if (!latestValue) continue;

      if (insight.name === 'page_fans' || insight.name === 'page_follows') {
        followers = typeof latestValue.value === 'number' ? latestValue.value : followers;
      }
      if (insight.name === 'page_impressions') {
        impressions = typeof latestValue.value === 'number' ? latestValue.value : impressions;
      }
      if (insight.name === 'page_post_engagements') {
        engagementRate = typeof latestValue.value === 'number' ? latestValue.value : engagementRate;
      }
    }

    return {
      followers,
      following: 0,
      postsCount: postCount.data.length,
      engagementRate,
      reach: Math.floor(impressions * 0.7),
      impressions,
      period,
    };
  }

  async getComments(account: SocialAccount, postId: string): Promise<SocialComment[]> {
    const result = await this.fetchAllPaginated<FacebookCommentResponse>(
      `/${postId}/comments?fields=id,message,from,created_time,parent&limit=100`,
      account,
    );

    return result.map((c) => ({
      id: c.id,
      postId,
      platform: 'facebook' as SocialPlatform,
      authorName: c.from.name,
      authorUsername: c.from.id,
      content: c.message,
      createdAt: new Date(c.created_time),
      isReply: !!c.parent,
    }));
  }

  async replyToComment(account: SocialAccount, commentId: string, content: string): Promise<SocialComment> {
    const result = await this._request<FacebookCommentResponse>(
      'POST',
      `/${commentId}/comments`,
      { message: content },
      account,
    );

    return {
      id: result.id,
      postId: commentId,
      platform: 'facebook',
      authorName: account.platformUsername,
      authorUsername: account.platformAccountId,
      content,
      createdAt: new Date(),
      isReply: true,
    };
  }

  async getMessages(account: SocialAccount, conversationId?: string): Promise<SocialMessage[]> {
    if (!conversationId) {
      const conversations = await this._request<{ data: FacebookConversation[] }>(
        'GET',
        `/${account.platformAccountId}/conversations?fields=id,snippet,updated_time,participants&limit=25`,
        undefined,
        account,
      );

      const messages: SocialMessage[] = [];
      for (const conv of conversations.data) {
        const convMessages = await this.getConversationMessages(account, conv.id);
        messages.push(...convMessages);
      }
      return messages;
    }

    return this.getConversationMessages(account, conversationId);
  }

  private async getConversationMessages(account: SocialAccount, conversationId: string): Promise<SocialMessage[]> {
    const result = await this.fetchAllPaginated<FacebookMessageResponse>(
      `/${conversationId}/messages?fields=id,message,from,created_time,attachments&limit=50`,
      account,
    );

    const accountId = account.platformAccountId;
    return result.map((m) => {
      const mediaUrl = m.attachments?.data?.[0]?.image_data?.url ?? m.attachments?.data?.[0]?.file_url;
      const isInbound = m.from.id !== accountId;

      return {
        id: m.id,
        accountId: account.id,
        platform: 'facebook' as SocialPlatform,
        conversationId,
        direction: isInbound ? 'inbound' : 'outbound',
        content: m.message,
        mediaUrl,
        senderName: m.from.name,
        senderId: m.from.id,
        createdAt: new Date(m.created_time),
        isRead: !isInbound,
      };
    });
  }

  async sendMessage(account: SocialAccount, conversationId: string, content: string, mediaUrl?: string): Promise<SocialMessage> {
    const body: Record<string, unknown> = { message: content };

    if (mediaUrl) {
      body.attachment = {
        type: 'image',
        payload: { url: mediaUrl, is_reusable: true },
      };
    }

    const result = await this._request<FacebookMessageResponse>(
      'POST',
      `/${conversationId}/messages`,
      body,
      account,
    );

    return {
      id: result.id,
      accountId: account.id,
      platform: 'facebook',
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

  verifyWebhook(payload: SocialWebhookPayload, signature: string): boolean {
    if (!this.config.clientSecret) return false;

    const expected = crypto
      .createHmac('sha256', this.config.clientSecret)
      .update(JSON.stringify(payload.data))
      .digest('hex');

    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  }

  async handleWebhook(payload: SocialWebhookPayload): Promise<void> {
    this.logger.info('Processing Facebook webhook', {
      event: payload.event,
      timestamp: payload.timestamp,
    });

    if (payload.event === 'page') {
      const entries = payload.data.entry as Array<{ id: string; changes?: Array<{ field: string; value: Record<string, unknown> }> }>;
      if (entries) {
        for (const entry of entries) {
          this.logger.info('Facebook page webhook entry', { pageId: entry.id });
        }
      }
    }

    if (payload.event === 'messaging_postbacks' || payload.event === 'messages') {
      this.logger.info('Facebook messaging webhook received', { event: payload.event });
    }
  }

  async getPageList(accessToken: string): Promise<FacebookPage[]> {
    const result = await this._request<{ data: FacebookPage[] }>(
      'GET',
      `/me/accounts?access_token=${accessToken}`,
    );
    return result.data;
  }

  async getInstagramBusinessAccount(pageId: string, account: SocialAccount): Promise<string | null> {
    const result = await this._request<{
      instagram_business_account?: { id: string };
    }>('GET', `/${pageId}?fields=instagram_business_account`, undefined, account);

    return result.instagram_business_account?.id ?? null;
  }

  async getPostInsights(postId: string, account: SocialAccount): Promise<{
    impressions: number;
    reach: number;
    engagement: number;
  }> {
    const result = await this._request<{ data: FacebookInsight[] }>(
      'GET',
      `/${postId}/insights/post_impressions,post_reach,post_engaged_users`,
      undefined,
      account,
    );

    const metrics: Record<string, number> = {};
    for (const insight of result.data) {
      const latestValue = insight.values[insight.values.length - 1];
      if (latestValue && typeof latestValue.value === 'number') {
        metrics[insight.name] = latestValue.value;
      }
    }

    return {
      impressions: metrics['post_impressions'] ?? 0,
      reach: metrics['post_reach'] ?? 0,
      engagement: metrics['post_engaged_users'] ?? 0,
    };
  }

  protected isTokenExpired(account: SocialAccount): boolean {
    if (!account.tokenExpiresAt) return false;
    return Date.now() >= account.tokenExpiresAt.getTime() - 60_000;
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
}