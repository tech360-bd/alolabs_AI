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

// ─── Google Business Profile API v4 Response Types ───────────────────────────

interface GoogleTokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope: string;
  token_type: string;
}

interface GoogleBusinessAccount {
  name: string;
  type: string;
  accountName?: string;
  role?: string;
  state?: { status: string };
  accountNumber?: string;
  permissionLevel?: string;
}

interface GoogleLocation {
  name: string;
  locationName: string;
  languageCode: string;
  phoneNumbers?: { primaryPhone: string }[];
  categories?: { primaryCategory: { displayName: string; categoryId: string } };
  storefrontAddress?: {
    locality: string;
    administrativeArea: string;
    postalCode: string;
    addressLines: string[];
    regionCode: string;
  };
  websiteUri?: string;
  openInfo?: { status: string; canReopen: boolean };
  locationKey?: { placeId: string; plusPageId?: string; requestId: string };
  metadata?: { duplicateLocationName?: string };
  profile?: { description: string };
}

interface GoogleLocalPost {
  name: string;
  languageCode: string;
  summary: string;
  state: 'LIVE' | 'DRAFT' | 'PROCESSING' | 'FAILED';
  topicType: string;
  updateTime: string;
  createTime: string;
  searchUrl?: string;
  localPostResourceName?: string;
  alertType?: string;
  callToAction?: { actionType: string; url: string };
  offer?: {
    couponCode?: string;
    redeemOnlineUrl?: string;
    termsConditions?: string;
    startDate?: string;
    endDate?: string;
  };
  event?: {
    title?: string;
    startDate?: { year: number; month: number; day: number };
    endTime?: { hours: number; minutes: number };
    startDate2?: { year: number; month: number; day: number };
  };
  media?: Array<{
    mediaFormat: string;
    sourceUrl: string;
    googleMapsUri?: string;
    thumbnailUrl?: string;
  }>;
}

interface GoogleInsightMetricValue {
  threshold: string;
  value: number;
}

interface GoogleInsightMetric {
  metric: string;
  value: GoogleInsightMetricValue[];
}

interface GoogleInsightResponse {
  name: string;
  timeZone?: string;
  metricMetrics?: GoogleInsightMetric[];
}

interface GoogleReview {
  name: string;
  reviewId: string;
  reviewer?: {
    displayName: string;
    profilePhotoUrl?: string;
    isAnonymous?: boolean;
  };
  starRating: number;
  comment?: string;
  createTime: string;
  updateTime: string;
  reviewReply?: {
    comment: string;
    updateTime: string;
  };
}

interface GoogleReviewReply {
  comment: string;
  updateTime?: string;
}

// ─── Google Business Profile Provider ─────────────────────────────────────────

export class GoogleBusinessProvider extends BaseSocialProvider {
  readonly platform: SocialPlatform = 'google_business' as SocialPlatform;

  constructor(config: OAuthConfig, logger?: Logger) {
    super({
      ...config,
      authUrl:
        config.authUrl ||
        'https://accounts.google.com/o/oauth2/v2/auth',
      tokenUrl:
        config.tokenUrl ||
        'https://oauth2.googleapis.com/token',
      apiUrl:
        config.apiUrl ||
        'https://mybusiness.googleapis.com/v4',
      scopes: config.scopes || [
        'https://www.googleapis.com/auth/business.manage',
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
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: params.toString(),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new AuthenticationError(
        this.platform,
        `Failed to exchange code for Google token: ${errorBody}`,
      );
    }

    const data = (await response.json()) as GoogleTokenResponse & {
      error?: { message: string; code: number };
    };

    if (data.error) {
      throw new AuthenticationError(this.platform, data.error.message);
    }

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in,
    };
  }

  async authenticate(code: string): Promise<SocialAccount> {
    const tokenData = await this.exchangeCodeForToken(code);

    const tempAccount = this.createAccount(tokenData, '', '');

    const accounts = await this._request<{ accounts: GoogleBusinessAccount[] }>(
      'GET',
      '/accounts',
      undefined,
      { ...tempAccount, accessToken: tokenData.accessToken },
    ).catch(() => ({ accounts: [] as GoogleBusinessAccount[] }));

    if (accounts.accounts.length === 0) {
      throw new AuthenticationError(
        this.platform,
        'No Google Business accounts found. Ensure the user has access to a Business Profile.',
      );
    }

    const businessAccount = accounts.accounts[0];

    const locations = await this._request<{ locations: GoogleLocation[] }>(
      'GET',
      `/${businessAccount.name}/locations?pageSize=10`,
      undefined,
      { ...tempAccount, accessToken: tokenData.accessToken },
    ).catch(() => ({ locations: [] as GoogleLocation[] }));

    const primaryLocation = locations.locations[0];
    const locationName = primaryLocation?.locationName || businessAccount.accountName || 'Google Business';

    return this.createAccount(
      tokenData,
      businessAccount.name,
      locationName,
      {
        accountName: businessAccount.name,
        accountNumber: businessAccount.accountNumber,
        primaryLocation: primaryLocation
          ? { name: primaryLocation.name, locationName: primaryLocation.locationName }
          : undefined,
        locations: locations.locations.map((loc) => ({
          name: loc.name,
          locationName: loc.locationName,
        })),
      },
    );
  }

  async refreshToken(account: SocialAccount): Promise<SocialAccount> {
    if (!account.refreshToken) {
      throw new AuthenticationError(this.platform, 'No refresh token available');
    }

    const params = new URLSearchParams({
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      grant_type: 'refresh_token',
      refresh_token: account.refreshToken,
    });

    const response = await fetch(this.config.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: params.toString(),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new AuthenticationError(
        this.platform,
        `Failed to refresh Google token: ${errorBody}`,
      );
    }

    const data = (await response.json()) as GoogleTokenResponse;
    const now = new Date();

    return {
      ...account,
      accessToken: data.access_token,
      tokenExpiresAt: new Date(now.getTime() + data.expires_in * 1000),
      updatedAt: now,
    };
  }

  // ─── Profile (Business Info) ───────────────────────────────────────────────

  async getProfile(account: SocialAccount): Promise<GoogleLocation> {
    const locationName = this.getLocationName(account);

    const location = await this._request<GoogleLocation>(
      'GET',
      `/${locationName}`,
      undefined,
      account,
    );

    return location;
  }

  async listLocations(account: SocialAccount): Promise<GoogleLocation[]> {
    const accountName = (account.metadata?.accountName as string) || account.platformAccountId;
    const result = await this._request<{ locations: GoogleLocation[] }>(
      'GET',
      `/${accountName}/locations?pageSize=100`,
      undefined,
      account,
    );
    return result.locations || [];
  }

  // ─── Publish Post (Local Post) ─────────────────────────────────────────────

  async publishPost(account: SocialAccount, options: SocialPublishOptions): Promise<SocialPost> {
    const locationName = this.getLocationName(account);

    const postBody: Record<string, unknown> = {
      languageCode: options.targeting?.languageCode || 'en',
      summary: options.content,
      topicType: options.targeting?.topicType || 'STANDARD',
    };

    if (options.targeting?.actionType && options.targeting?.actionUrl) {
      postBody.callToAction = {
        actionType: options.targeting.actionType,
        url: options.targeting.actionUrl,
      };
    }

    if (options.targeting?.offerStartDate) {
      postBody.offer = {
        startDate: options.targeting.offerStartDate,
        endDate: options.targeting.offerEndDate,
        couponCode: options.targeting.couponCode,
        termsConditions: options.targeting.termsConditions,
        redeemOnlineUrl: options.targeting.actionUrl,
      };
    }

    if (options.mediaUrls && options.mediaUrls.length > 0) {
      postBody.media = options.mediaUrls.map((url) => ({
        mediaFormat: 'PHOTO',
        sourceUrl: url,
      }));
    }

    if (options.targeting?.eventType && options.targeting?.eventTitle) {
      postBody.event = {
        title: options.targeting.eventTitle,
        startDate: options.targeting.eventStartDate,
      };
      postBody.topicType = 'EVENT';
    }

    const result = await this._request<GoogleLocalPost>(
      'POST',
      `/${locationName}/localPosts`,
      postBody,
      account,
    );

    return this.createPost(
      account.id,
      options.content,
      result.name,
      options.mediaUrls,
    );
  }

  async deletePost(account: SocialAccount, postId: string): Promise<void> {
    await this._request<Record<string, never>>(
      'DELETE',
      `/${postId}`,
      undefined,
      account,
    );
  }

  // ─── Analytics (Insights) ──────────────────────────────────────────────────

  async getAnalytics(account: SocialAccount, period: { start: Date; end: Date }): Promise<SocialAnalytics> {
    const locationName = this.getLocationName(account);

    const baseMetrics = [
      'QUERIES_DIRECT',
      'QUERIES_INDIRECT',
      'VIEWS_MAPS',
      'VIEWS_SEARCH',
      'ACTIONS_WEBSITE',
      'ACTIONS_CALL',
      'ACTIONS_DRIVING_DIRECTIONS',
      'PHOTOS_VIEWS',
      'POST_IMPRESSIONS',
    ].join(',');

    const dailyMetrics = [
      'QUERIES_DIRECT',
      'QUERIES_INDIRECT',
      'VIEWS_MAPS',
      'VIEWS_SEARCH',
    ].join(',');

    const [baseInsights, dailyInsights] = await Promise.all([
      this._request<GoogleInsightResponse>(
        'GET',
        `/${locationName}/insights?baseMetrics.metric=${baseMetrics}&basicRequest.timeRange.startYear=${period.start.getFullYear()}&basicRequest.timeRange.startMonth=${period.start.getMonth() + 1}&basicRequest.timeRange.startDay=${period.start.getDate()}&basicRequest.timeRange.endYear=${period.end.getFullYear()}&basicRequest.timeRange.endMonth=${period.end.getMonth() + 1}&basicRequest.timeRange.endDay=${period.end.getDate()}`,
        undefined,
        account,
      ).catch(() => ({ name: locationName, metricMetrics: [] as GoogleInsightMetric[] })),

      this._request<GoogleInsightResponse>(
        'GET',
        `/${locationName}/insights?dailyMetrics.metric=${dailyMetrics}&basicRequest.timeRange.startYear=${period.start.getFullYear()}&basicRequest.timeRange.startMonth=${period.start.getMonth() + 1}&basicRequest.timeRange.startDay=${period.start.getDate()}&basicRequest.timeRange.endYear=${period.end.getFullYear()}&basicRequest.timeRange.endMonth=${period.end.getMonth() + 1}&basicRequest.timeRange.endDay=${period.end.getDate()}`,
        undefined,
        account,
      ).catch(() => ({ name: locationName, metricMetrics: [] as GoogleInsightMetric[] })),
    ]);

    const metrics: Record<string, number> = {};

    for (const metric of [...(baseInsights.metricMetrics || []), ...(dailyInsights.metricMetrics || [])]) {
      const totalValue = metric.value.reduce((sum, v) => {
        if (v.value === undefined || v.value === null) return sum;
        return sum + (typeof v.value === 'number' ? v.value : 0);
      }, 0);
      metrics[metric.metric] = totalValue;
    }

    const queriesDirect = metrics['QUERIES_DIRECT'] ?? 0;
    const queriesIndirect = metrics['QUERIES_INDIRECT'] ?? 0;
    const viewsMaps = metrics['VIEWS_MAPS'] ?? 0;
    const viewsSearch = metrics['VIEWS_SEARCH'] ?? 0;
    const actionsWebsite = metrics['ACTIONS_WEBSITE'] ?? 0;
    const actionsCall = metrics['ACTIONS_CALL'] ?? 0;
    const actionsDriving = metrics['ACTIONS_DRIVING_DIRECTIONS'] ?? 0;
    const photosViews = metrics['PHOTOS_VIEWS'] ?? 0;
    const postImpressions = metrics['POST_IMPRESSIONS'] ?? 0;

    const totalViews = viewsMaps + viewsSearch;
    const totalActions = actionsWebsite + actionsCall + actionsDriving;
    const engagementRate = totalViews > 0 ? (totalActions / totalViews) * 100 : 0;

    return {
      followers: queriesDirect,
      following: 0,
      postsCount: postImpressions > 0 ? 1 : 0,
      engagementRate: Math.round(engagementRate * 100) / 100,
      reach: totalViews,
      impressions: queriesDirect + queriesIndirect + totalViews,
      period,
    };
  }

  // ─── Comments (Post Replies) ───────────────────────────────────────────────

  async getComments(account: SocialAccount, postId: string): Promise<SocialComment[]> {
    const post = await this._request<GoogleLocalPost>(
      'GET',
      `/${postId}`,
      undefined,
      account,
    ).catch(() => null);

    if (!post) {
      return [];
    }

    return [
      {
        id: post.name,
        postId,
        platform: this.platform,
        authorName: account.platformUsername,
        authorUsername: account.platformAccountId,
        content: post.summary || '',
        createdAt: post.createTime ? new Date(post.createTime) : new Date(),
        isReply: false,
      },
    ];
  }

  async replyToComment(account: SocialAccount, commentId: string, content: string): Promise<SocialComment> {
    const postUpdate = await this._request<GoogleLocalPost>(
      'PATCH',
      `/${commentId}`,
      { summary: content },
      account,
    ).catch(() => null);

    return {
      id: postUpdate?.name || commentId,
      postId: commentId,
      platform: this.platform,
      authorName: account.platformUsername,
      authorUsername: account.platformAccountId,
      content,
      createdAt: new Date(),
      isReply: true,
    };
  }

  // ─── Messages (Reviews) ────────────────────────────────────────────────────

  async getMessages(account: SocialAccount, conversationId?: string): Promise<SocialMessage[]> {
    const locationName = conversationId || this.getLocationName(account);

    const reviews = await this.fetchAllGoogleReviews(account, locationName);

    return reviews.map((review) => {
      const reviewId = review.name.split('/').pop() || review.reviewId;
      const hasReply = !!review.reviewReply;

      return {
        id: reviewId,
        accountId: account.id,
        platform: this.platform,
        conversationId: locationName,
        direction: 'inbound' as const,
        content: review.comment || `[${review.starRating}-star review]`,
        senderName: review.reviewer?.displayName || 'Anonymous',
        senderId: reviewId,
        createdAt: review.createTime ? new Date(review.createTime) : new Date(),
        isRead: hasReply,
      };
    });
  }

  async sendMessage(
    account: SocialAccount,
    conversationId: string,
    content: string,
    _mediaUrl?: string,
  ): Promise<SocialMessage> {
    const locationName = this.getLocationName(account);
    const reviewName = `${locationName}/reviews/${conversationId}`;

    const reply: GoogleReviewReply = { comment: content };

    const result = await this._request<GoogleReviewReply>(
      'POST',
      `/${reviewName}/reply`,
      reply as unknown as Record<string, unknown>,
      account,
    );

    return {
      id: `${conversationId}_reply`,
      accountId: account.id,
      platform: this.platform,
      conversationId: locationName,
      direction: 'outbound',
      content: result.comment || content,
      senderName: account.platformUsername,
      senderId: account.platformAccountId,
      createdAt: result.updateTime ? new Date(result.updateTime) : new Date(),
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
    this.logger.info('Processing Google Business webhook', {
      event: payload.event,
      timestamp: payload.timestamp,
    });

    if (payload.event === 'google.mybusiness.review.update') {
      this.logger.info('Google Business review updated', { data: payload.data });
    }

    if (payload.event === 'google.mybusiness.question.update') {
      this.logger.info('Google Business question updated', { data: payload.data });
    }
  }

  // ─── Additional Google Business-specific Methods ───────────────────────────

  async getReviews(
    account: SocialAccount,
    pageSize: number = 50,
    pageToken?: string,
  ): Promise<{ reviews: GoogleReview[]; nextPageToken?: string }> {
    const locationName = this.getLocationName(account);
    let path = `/${locationName}/reviews?pageSize=${pageSize}&orderBy=RATING_DESC`;
    if (pageToken) {
      path += `&pageToken=${pageToken}`;
    }

    const result = await this._request<{ reviews?: GoogleReview[]; nextPageToken?: string }>(
      'GET',
      path,
      undefined,
      account,
    );

    return {
      reviews: result.reviews || [],
      nextPageToken: result.nextPageToken,
    };
  }

  async replyToReview(
    account: SocialAccount,
    reviewName: string,
    comment: string,
  ): Promise<GoogleReviewReply> {
    return this._request<GoogleReviewReply>(
      'POST',
      `/${reviewName}/reply`,
      { comment },
      account,
    );
  }

  async deleteReviewReply(account: SocialAccount, reviewName: string): Promise<void> {
    await this._request<Record<string, never>>(
      'DELETE',
      `/${reviewName}/reply`,
      undefined,
      account,
    );
  }

  async getLocalPosts(
    account: SocialAccount,
    pageSize: number = 50,
  ): Promise<GoogleLocalPost[]> {
    const locationName = this.getLocationName(account);
    const result = await this._request<{ localPosts?: GoogleLocalPost[] }>(
      'GET',
      `/${locationName}/localPosts?pageSize=${pageSize}`,
      undefined,
      account,
    );
    return result.localPosts || [];
  }

  async updateBusinessInfo(
    account: SocialAccount,
    locationName: string,
    updates: {
      description?: string;
      phone?: string;
      websiteUri?: string;
      address?: {
        addressLines?: string[];
        locality?: string;
        administrativeArea?: string;
        postalCode?: string;
        regionCode?: string;
      };
    },
  ): Promise<GoogleLocation> {
    const updateMask = Object.keys(updates).join(',');

    const body: Record<string, unknown> = {};
    if (updates.description) {
      body.profile = { description: updates.description };
    }
    if (updates.phone) {
      body.phoneNumbers = { primaryPhone: updates.phone };
    }
    if (updates.websiteUri) {
      body.websiteUri = updates.websiteUri;
    }
    if (updates.address) {
      body.storefrontAddress = updates.address;
    }

    return this._request<GoogleLocation>(
      'PATCH',
      `/${locationName}?updateMask=${updateMask}`,
      body,
      account,
    );
  }

  // ─── Private Helpers ───────────────────────────────────────────────────────

  private async fetchAllGoogleReviews(
    account: SocialAccount,
    locationName: string,
  ): Promise<GoogleReview[]> {
    const allReviews: GoogleReview[] = [];
    let pageToken: string | undefined;

    do {
      const result = await this.getReviews(account, 50, pageToken);
      allReviews.push(...result.reviews);
      pageToken = result.nextPageToken;
    } while (pageToken);

    return allReviews;
  }

  private getLocationName(account: SocialAccount): string {
    const primaryLocation = account.metadata?.primaryLocation as
      | { name: string; locationName: string }
      | undefined;
    if (primaryLocation?.name) {
      return primaryLocation.name;
    }

    const locations = account.metadata?.locations as
      | Array<{ name: string; locationName: string }>
      | undefined;
    if (locations && locations.length > 0) {
      return locations[0].name;
    }

    return account.platformAccountId;
  }

  private formatGoogleDate(date: Date): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  // ─── Protected Helpers ────────────────────────────────────────────────────

  protected isTokenExpired(account: SocialAccount): boolean {
    if (!account.tokenExpiresAt) return false;
    return Date.now() >= account.tokenExpiresAt.getTime() - 60_000;
  }

  protected buildAuthHeaders(account: SocialAccount): Record<string, string> {
    return { Authorization: `Bearer ${account.accessToken}` };
  }

  protected extractRateLimitInfo(response: Response): { resetAt?: Date; limit?: number } | null {
    const retryAfter = response.headers.get('retry-after');
    if (retryAfter) {
      return {
        resetAt: new Date(Date.now() + parseInt(retryAfter, 10) * 1000),
        limit: 0,
      };
    }

    if (response.status === 429) {
      return {
        resetAt: new Date(Date.now() + 60_000),
        limit: 0,
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
          code: number;
          message: string;
          status: string;
          errors?: Array<{ message: string; domain: string; reason: string }>;
        };
      };

      if (data.error) {
        const googleCode = data.error.code;
        const status = data.error.status;

        let retryable = false;
        if (status === 'RESOURCE_EXHAUSTED' || status === 'UNAVAILABLE') {
          retryable = true;
        }
        if (googleCode === 429 || googleCode === 500 || googleCode === 503) {
          retryable = true;
        }

        return {
          message: data.error.message,
          code: `GOOGLE_${status || googleCode}`,
          statusCode: googleCode === 401 ? 401 : googleCode === 403 ? 403 : googleCode === 404 ? 404 : 500,
          retryable,
        };
      }
    } catch {
      // ignore parse errors
    }

    return { message: errorBody, code: 'UNKNOWN', statusCode: 500, retryable: false };
  }
}