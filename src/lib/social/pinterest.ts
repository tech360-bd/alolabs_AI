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
} from './types';
import { BaseSocialProvider, type Logger } from './base-provider';

interface PinterestTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
  scope: string;
}

interface PinterestUser {
  id: string;
  username: string;
  display_name: string;
  profile_image: string;
  account_type: string;
  website_url?: string;
  bio?: string;
}

interface PinterestPin {
  id: string;
  title: string;
  description: string;
  link?: string;
  media_type: string;
  media?: { images?: { '150x150': { url: string }; '600x': { url: string }; '1200x': { url: string } } };
  board_id: string;
  created_at: string;
  note?: string;
}

interface PinterestBoard {
  id: string;
  name: string;
  description?: string;
  privacy: 'PUBLIC' | 'PROTECTED' | 'SECRET';
  pin_count: number;
  media?: { image_cover_url?: string };
  created_at: string;
}

interface PinterestBoardSection {
  id: string;
  name: string;
}

interface PinterestPinAnalytics {
  pin_metrics: {
    impression: number;
    reach: number;
    save: number;
    click: number;
    engagement: number;
    pin_click: number;
  };
  all_metrics: {
    impression: number;
    reach: number;
    save: number;
    click: number;
    engagement: number;
  };
}

interface PinterestUserAnalytics {
  follower_count: number;
  following_count: number;
  monthly_viewers: number;
  pin_count: number;
  board_count: number;
}

export class PinterestProvider extends BaseSocialProvider {
  readonly platform: SocialPlatform = 'pinterest';

  constructor(config: OAuthConfig, logger?: Logger) {
    super({
      ...config,
      authUrl: config.authUrl || 'https://www.pinterest.com/oauth/',
      tokenUrl: config.tokenUrl || 'https://api.pinterest.com/v5/oauth/token',
      apiUrl: config.apiUrl || 'https://api.pinterest.com/v5',
    }, logger);
  }

  generateAuthUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      response_type: 'code',
      scope: this.config.scopes.join(','),
      state,
    });
    return `${this.config.authUrl}?${params.toString()}`;
  }

  protected async exchangeCodeForToken(code: string): Promise<{
    accessToken: string;
    refreshToken?: string;
    expiresIn?: number;
  }> {
    const body = new URLSearchParams({
      code,
      redirect_uri: this.config.redirectUri,
      grant_type: 'authorization_code',
    });

    const basicAuth = Buffer.from(`${this.config.clientId}:${this.config.clientSecret}`).toString('base64');

    const response = await fetch(this.config.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${basicAuth}`,
      },
      body: body.toString(),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new AuthenticationError('pinterest', `Failed to exchange code for token: ${errorBody}`);
    }

    const data = (await response.json()) as PinterestTokenResponse;
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in,
    };
  }

  async authenticate(code: string): Promise<SocialAccount> {
    const tokenData = await this.exchangeCodeForToken(code);

    const tempAccount = this.createAccount(tokenData, '', '');
    const user = await this._request<PinterestUser>(
      'GET',
      '/user_account',
      undefined,
      tempAccount,
    );

    return this.createAccount(
      tokenData,
      user.id,
      user.username,
      { displayName: user.display_name, profileImage: user.profile_image },
    );
  }

  async refreshToken(account: SocialAccount): Promise<SocialAccount> {
    if (!account.refreshToken) {
      throw new AuthenticationError('pinterest', 'No refresh token available');
    }

    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: account.refreshToken,
    });

    const basicAuth = Buffer.from(`${this.config.clientId}:${this.config.clientSecret}`).toString('base64');

    const response = await fetch(this.config.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${basicAuth}`,
      },
      body: body.toString(),
    });

    if (!response.ok) {
      throw new AuthenticationError('pinterest', 'Failed to refresh Pinterest token');
    }

    const data = (await response.json()) as PinterestTokenResponse;
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
    const boardId = options.targeting?.boardId;
    if (!boardId) {
      throw new SocialError('Pinterest pins require a board ID in targeting.boardId', 'pinterest', 'BOARD_ID_REQUIRED');
    }

    if (!options.mediaUrls || options.mediaUrls.length === 0) {
      throw new SocialError('Pinterest pins require at least one image URL', 'pinterest', 'IMAGE_REQUIRED');
    }

    const body: Record<string, unknown> = {
      board_id: boardId,
      title: options.content.substring(0, 100),
      description: options.content,
      media_source: {
        source_type: 'image_url',
        url: options.mediaUrls[0],
      },
    };

    if (options.targeting?.link) {
      body.link = options.targeting.link;
    }

    const result = await this._request<PinterestPin>(
      'POST',
      '/pins',
      body,
      account,
    );

    return this.createPost(account.id, options.content, result.id, options.mediaUrls);
  }

  async deletePost(account: SocialAccount, postId: string): Promise<void> {
    await this._request<void>('DELETE', `/pins/${postId}`, undefined, account);
  }

  async getPin(account: SocialAccount, pinId: string): Promise<PinterestPin> {
    return this._request<PinterestPin>('GET', `/pins/${pinId}`, undefined, account);
  }

  async createBoard(
    account: SocialAccount,
    name: string,
    description?: string,
    privacy: 'PUBLIC' | 'PROTECTED' | 'SECRET' = 'PUBLIC',
  ): Promise<PinterestBoard> {
    const body: Record<string, unknown> = { name, privacy };
    if (description) body.description = description;

    return this._request<PinterestBoard>('POST', '/boards', body, account);
  }

  async getBoards(account: SocialAccount): Promise<PinterestBoard[]> {
    const boards = await this.fetchAllPaginated<PinterestBoard>(
      '/boards',
      account,
    );

    return boards;
  }

  async deleteBoard(account: SocialAccount, boardId: string): Promise<void> {
    await this._request<void>('DELETE', `/boards/${boardId}`, undefined, account);
  }

  async getBoardPins(account: SocialAccount, boardId: string): Promise<PinterestPin[]> {
    return this.fetchAllPaginated<PinterestPin>(
      `/boards/${boardId}/pins`,
      account,
    );
  }

  async createBoardSection(account: SocialAccount, boardId: string, name: string): Promise<PinterestBoardSection> {
    return this._request<PinterestBoardSection>(
      'POST',
      `/boards/${boardId}/sections`,
      { name },
      account,
    );
  }

  async getAnalytics(account: SocialAccount, period: { start: Date; end: Date }): Promise<SocialAnalytics> {
    const startDate = this.formatPinterestDate(period.start);
    const endDate = this.formatPinterestDate(period.end);

    const userAnalytics = await this._request<PinterestUserAnalytics>(
      'GET',
      `/user_account/analytics?start_date=${startDate}&end_date=${endDate}`,
      undefined,
      account,
    ).catch(() => ({
      follower_count: 0,
      following_count: 0,
      monthly_viewers: 0,
      pin_count: 0,
      board_count: 0,
    }));

    return {
      followers: userAnalytics.follower_count,
      following: userAnalytics.following_count,
      postsCount: userAnalytics.pin_count,
      engagementRate: 0,
      reach: userAnalytics.monthly_viewers,
      impressions: userAnalytics.monthly_viewers,
      period,
    };
  }

  async getPinAnalytics(
    account: SocialAccount,
    pinId: string,
    period: { start: Date; end: Date },
  ): Promise<PinterestPinAnalytics> {
    const startDate = this.formatPinterestDate(period.start);
    const endDate = this.formatPinterestDate(period.end);

    return this._request<PinterestPinAnalytics>(
      'GET',
      `/pins/${pinId}/analytics?start_date=${startDate}&end_date=${endDate}`,
      undefined,
      account,
    );
  }

  async getComments(account: SocialAccount, postId: string): Promise<SocialComment[]> {
    const comments = await this.fetchAllPaginated<{
      id: string;
      text: string;
      pin_id: string;
      created_at: string;
      creator: { id: string; username: string; profile_image: string };
      parent_comment_id?: string;
    }>(
      `/pins/${postId}/comments`,
      account,
    );

    return comments.map((c) => ({
      id: c.id,
      postId,
      platform: 'pinterest' as SocialPlatform,
      authorName: c.creator.username,
      authorUsername: c.creator.id,
      content: c.text,
      createdAt: new Date(c.created_at),
      isReply: !!c.parent_comment_id,
    }));
  }

  async replyToComment(account: SocialAccount, commentId: string, content: string): Promise<SocialComment> {
    const result = await this._request<{
      id: string;
      text: string;
      created_at: string;
      creator: { id: string; username: string; profile_image: string };
    }>(
      'POST',
      `/comments/${commentId}/replies`,
      { text: content },
      account,
    );

    return {
      id: result.id,
      postId: commentId,
      platform: 'pinterest',
      authorName: result.creator.username,
      authorUsername: result.creator.id,
      content,
      createdAt: new Date(result.created_at),
      isReply: true,
    };
  }

  async getMessages(_account: SocialAccount, _conversationId?: string): Promise<SocialMessage[]> {
    throw new SocialError('Pinterest does not support direct messaging', 'pinterest', 'NOT_SUPPORTED');
  }

  async sendMessage(_account: SocialAccount, _conversationId: string, _content: string, _mediaUrl?: string): Promise<SocialMessage> {
    throw new SocialError('Pinterest does not support direct messaging', 'pinterest', 'NOT_SUPPORTED');
  }

  verifyWebhook(payload: SocialWebhookPayload, signature: string): boolean {
    if (!this.config.clientSecret) return false;

    const message = JSON.stringify(payload.data);
    const expected = crypto.createHmac('sha256', this.config.clientSecret).update(message).digest('hex');

    try {
      return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
    } catch {
      return false;
    }
  }

  async handleWebhook(payload: SocialWebhookPayload): Promise<void> {
    this.logger.info('Processing Pinterest webhook', {
      event: payload.event,
      timestamp: payload.timestamp,
    });

    if (payload.event === 'pin.pin_created') {
      this.logger.info('Pinterest pin created', { data: payload.data });
    }

    if (payload.event === 'board.board_created') {
      this.logger.info('Pinterest board created', { data: payload.data });
    }
  }

  private formatPinterestDate(date: Date): string {
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
        code?: number;
        message?: string;
        error_code?: string;
        error_description?: string;
        status?: string;
      };

      const message = data.message || data.error_description || errorBody;
      const code = String(data.code || data.error_code || 'UNKNOWN');
      const isRateLimit = code === '429' || data.status === '429' || message.includes('rate limit');

      return {
        message,
        code,
        statusCode: data.code || 500,
        retryable: isRateLimit || (data.code !== undefined && data.code >= 500),
      };
    } catch {
      return { message: errorBody, code: 'UNKNOWN', statusCode: 500, retryable: false };
    }
  }
}