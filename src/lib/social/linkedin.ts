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

interface LinkedInTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope?: string;
}

interface LinkedInProfile {
  localizedFirstName: string;
  localizedLastName: string;
  id: string;
}

interface LinkedInPostResponse {
  id: string;
}

interface LinkedInUgcPostResponse {
  id: string;
}

interface LinkedInComment {
  $id: string;
  actor: { name: string; urn: string };
  message: { text: string };
  created: { time: number };
  parentComment?: string;
}

interface LinkedInMessage {
  $id: string;
  $type: string;
  from?: { 'com.linkedin.common.MemberActor': { urn: string } };
  text?: string;
  attachments?: Array<{
    'com.linkedin.common.MediaAttachment': { media: string };
  }>;
  createdAt?: number;
}

interface LinkedInOrgAnalytics {
  followerCount?: { values: Array<{ timeRange: { start: number; end: number }; value: number }> };
  impressionsCount?: { values: Array<{ timeRange: { start: number; end: number }; value: number }> };
  engagementCount?: { values: Array<{ timeRange: { start: number; end: number }; value: number }> };
  shareCount?: { values: Array<{ timeRange: { start: number; end: number }; value: number }> };
}

function extractLinkedInId(urn: string): string {
  const parts = urn.split(':');
  return parts[parts.length - 1];
}

export class LinkedInProvider extends BaseSocialProvider {
  readonly platform: SocialPlatform = 'linkedin';

  constructor(config: OAuthConfig, logger?: Logger) {
    super({
      ...config,
      authUrl: config.authUrl || 'https://www.linkedin.com/oauth/v2/authorization',
      tokenUrl: config.tokenUrl || 'https://www.linkedin.com/oauth/v2/accessToken',
      apiUrl: config.apiUrl || 'https://api.linkedin.com/v2',
    }, logger);
  }

  protected async exchangeCodeForToken(code: string): Promise<{
    accessToken: string;
    refreshToken?: string;
    expiresIn?: number;
  }> {
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: this.config.redirectUri,
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
    });

    const response = await fetch(this.config.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new AuthenticationError('linkedin', `Failed to exchange code for token: ${errorBody}`);
    }

    const data = (await response.json()) as LinkedInTokenResponse;
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in,
    };
  }

  async authenticate(code: string): Promise<SocialAccount> {
    const tokenData = await this.exchangeCodeForToken(code);

    const profile = await this._request<LinkedInProfile>(
      'GET',
      '/me?projection=(id,localizedFirstName,localizedLastName)',
      undefined,
      { ...this.createAccount(tokenData, '', ''), accessToken: tokenData.accessToken },
    );

    const fullName = `${profile.localizedFirstName} ${profile.localizedLastName}`;
    return this.createAccount(tokenData, profile.id, fullName, {
      personUrn: `urn:li:person:${profile.id}`,
    });
  }

  async refreshToken(account: SocialAccount): Promise<SocialAccount> {
    if (!account.refreshToken) {
      throw new AuthenticationError('linkedin', 'No refresh token available');
    }

    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: account.refreshToken,
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
    });

    const response = await fetch(this.config.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    if (!response.ok) {
      throw new AuthenticationError('linkedin', 'Failed to refresh LinkedIn token');
    }

    const data = (await response.json()) as LinkedInTokenResponse;
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
    const hasMedia = options.mediaUrls && options.mediaUrls.length > 0;

    if (hasMedia) {
      return this.publishUgcPost(account, options);
    }

    const personUrn = (account.metadata?.personUrn as string) || `urn:li:person:${account.platformAccountId}`;
    const postUrn = `urn:li:post:${crypto.randomUUID()}`;

    const body = {
      author: personUrn,
      commentary: options.content,
      visibility: 'PUBLIC',
      distribution: {
        feedDistribution: 'MAIN_FEED',
        targetEntities: [],
        thirdPartyDistributionChannels: [],
      },
      lifecycleState: 'PUBLISHED',
      isReshareDisabledByAuthor: false,
    };

    const result = await this._request<LinkedInPostResponse>('POST', '/posts', body, account);

    return this.createPost(account.id, options.content, extractLinkedInId(result.id));
  }

  private async publishUgcPost(account: SocialAccount, options: SocialPublishOptions): Promise<SocialPost> {
    const personUrn = (account.metadata?.personUrn as string) || `urn:li:person:${account.platformAccountId}`;

    let mediaUploadResult: { uploadUrl: string; asset: string } | null = null;

    if (options.mediaUrls && options.mediaUrls.length > 0) {
      mediaUploadResult = await this.registerMediaUpload(account, options.mediaUrls[0]);
      await this.uploadMediaToUrl(options.mediaUrls[0], mediaUploadResult.uploadUrl);
    }

    const body: Record<string, unknown> = {
      author: personUrn,
      commentary: options.content,
      visibility: 'PUBLIC',
      lifecycleState: 'PUBLISHED',
    };

    if (mediaUploadResult) {
      body.content = {
        media: {
          title: options.content.substring(0, 200),
          id: mediaUploadResult.asset,
        },
      };
    }

    const result = await this._request<LinkedInUgcPostResponse>('POST', '/ugcPosts', body, account);

    return this.createPost(account.id, options.content, extractLinkedInId(result.id), options.mediaUrls);
  }

  private async registerMediaUpload(
    account: SocialAccount,
    mediaUrl: string,
  ): Promise<{ uploadUrl: string; asset: string }> {
    const body = {
      initializeUploadRequest: {
        owner: (account.metadata?.personUrn as string) || `urn:li:person:${account.platformAccountId}`,
        fileSizeBytes: 0,
        uploadCaptions: false,
        uploadThumbnail: false,
      },
    };

    try {
      const mediaResponse = await fetch(mediaUrl, { method: 'HEAD' });
      const contentLength = mediaResponse.headers.get('content-length');
      if (contentLength) {
        body.initializeUploadRequest.fileSizeBytes = parseInt(contentLength, 10);
      }
    } catch {
      // Proceed without content length
    }

    const response = await fetch('https://api.linkedin.com/rest/images?action=initializeUpload', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${account.accessToken}`,
        'LinkedIn-Version': '202401',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new SocialError('Failed to register LinkedIn media upload', 'linkedin', 'MEDIA_UPLOAD_FAILED', response.status);
    }

    const data = (await response.json()) as {
      value: { uploadMechanism: { 'com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest': { uploadUrl: string; headers: Record<string, string> } }; asset: string };
    };

    return {
      uploadUrl: data.value.uploadMechanism['com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest'].uploadUrl,
      asset: data.value.asset,
    };
  }

  private async uploadMediaToUrl(mediaUrl: string, uploadUrl: string): Promise<void> {
    const mediaResponse = await fetch(mediaUrl);
    if (!mediaResponse.ok) {
      throw new SocialError('Failed to download media for LinkedIn upload', 'linkedin', 'MEDIA_DOWNLOAD_FAILED');
    }

    const blob = await mediaResponse.blob();
    const uploadResponse = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': blob.type },
      body: blob,
    });

    if (!uploadResponse.ok) {
      throw new SocialError('Failed to upload media to LinkedIn', 'linkedin', 'MEDIA_UPLOAD_FAILED', uploadResponse.status);
    }
  }

  async deletePost(account: SocialAccount, postId: string): Promise<void> {
    const postUrn = postId.startsWith('urn:li:') ? postId : `urn:li:post:${postId}`;
    await this._request<void>('POST', `/posts/${encodeURIComponent(postUrn)}`, {
      lifecycleState: 'DELETED',
    }, account);
  }

  async getAnalytics(account: SocialAccount, period: { start: Date; end: Date }): Promise<SocialAnalytics> {
    const orgId = account.metadata?.organizationId as string | undefined;
    const timeIntervals = `${Math.floor(period.start.getTime() / 1000)}&endTime=${Math.floor(period.end.getTime() / 1000)}`;

    const profile = await this._request<LinkedInProfile>(
      'GET',
      '/me?projection=(id,localizedFirstName,localizedLastName)',
      undefined,
      account,
    ).catch(() => null);

    let followers = 0;
    let impressions = 0;
    let engagementRate = 0;

    if (orgId) {
      try {
        const analytics = await this._request<LinkedInOrgAnalytics>(
          'GET',
          `/organizationalEntityFollowerStatistics?q=organizationalEntity&organizationalEntity=${encodeURIComponent(orgId)}&timeIntervals=(timeRange:(${timeIntervals}))`,
          undefined,
          account,
        );

        const followerValues = analytics.followerCount?.values;
        if (followerValues && followerValues.length > 0) {
          followers = followerValues[followerValues.length - 1].value;
        }

        const impressionValues = analytics.impressionsCount?.values;
        if (impressionValues && impressionValues.length > 0) {
          impressions = impressionValues[impressionValues.length - 1].value;
        }

        const engagementValues = analytics.engagementCount?.values;
        if (engagementValues && engagementValues.length > 0) {
          engagementRate = impressions > 0 ? (engagementValues[engagementValues.length - 1].value / impressions) * 100 : 0;
        }
      } catch {
        this.logger.warn('Failed to fetch LinkedIn organization analytics');
      }
    }

    return {
      followers,
      following: 0,
      postsCount: 0,
      engagementRate,
      reach: Math.floor(impressions * 0.6),
      impressions,
      period,
    };
  }

  async getComments(account: SocialAccount, postId: string): Promise<SocialComment[]> {
    const postUrn = postId.startsWith('urn:li:') ? postId : `urn:li:post:${postId}`;
    const comments = await this.fetchAllPaginated<LinkedInComment>(
      `/socialActions/${encodeURIComponent(postUrn)}/comments?projection=(actor,name,id,message,created,parentComment)`,
      account,
    );

    return comments.map((c) => ({
      id: c.$id,
      postId,
      platform: 'linkedin' as SocialPlatform,
      authorName: c.actor?.name ?? 'Unknown',
      authorUsername: extractLinkedInId(c.actor?.urn ?? ''),
      content: c.message?.text ?? '',
      createdAt: new Date(c.created.time),
      isReply: !!c.parentComment,
    }));
  }

  async replyToComment(account: SocialAccount, commentId: string, content: string): Promise<SocialComment> {
    const commentUrn = commentId.startsWith('urn:li:') ? commentId : `urn:li:comment:${commentId}`;
    const personUrn = (account.metadata?.personUrn as string) || `urn:li:person:${account.platformAccountId}`;

    const result = await this._request<LinkedInComment>(
      'POST',
      `/socialActions/${encodeURIComponent(commentUrn)}/comments`,
      {
        actor: personUrn,
        message: { text: content },
      },
      account,
    );

    return {
      id: result.$id,
      postId: commentId,
      platform: 'linkedin',
      authorName: account.platformUsername,
      authorUsername: account.platformAccountId,
      content,
      createdAt: new Date(),
      isReply: true,
    };
  }

  async getMessages(account: SocialAccount, conversationId?: string): Promise<SocialMessage[]> {
    if (!conversationId) {
      const conversations = await this._request<{ elements: Array<{ id: string }> }>(
        'GET',
        '/messages?fields=id',
        undefined,
        account,
      );
      const messages: SocialMessage[] = [];
      for (const conv of conversations.elements) {
        const convMessages = await this.getConversationMessages(account, conv.id);
        messages.push(...convMessages);
      }
      return messages;
    }

    return this.getConversationMessages(account, conversationId);
  }

  private async getConversationMessages(account: SocialAccount, conversationId: string): Promise<SocialMessage[]> {
    const messages = await this.fetchAllPaginated<LinkedInMessage>(
      `/messages/${conversationId}/events?fields=id,$type,text,from,attachments,createdAt`,
      account,
    );

    const accountId = account.platformAccountId;
    return messages.map((m) => {
      const fromUrn = m.from?.['com.linkedin.common.MemberActor']?.urn ?? '';
      const isInbound = extractLinkedInId(fromUrn) !== accountId;

      let mediaUrl: string | undefined;
      if (m.attachments && m.attachments.length > 0) {
        mediaUrl = m.attachments[0]['com.linkedin.common.MediaAttachment']?.media;
      }

      return {
        id: m.$id,
        accountId: account.id,
        platform: 'linkedin' as SocialPlatform,
        conversationId,
        direction: isInbound ? 'inbound' : 'outbound',
        content: m.text ?? '',
        mediaUrl,
        senderName: isInbound ? 'Contact' : account.platformUsername,
        senderId: extractLinkedInId(fromUrn),
        createdAt: m.createdAt ? new Date(m.createdAt) : new Date(),
        isRead: !isInbound,
      };
    });
  }

  async sendMessage(account: SocialAccount, conversationId: string, content: string, mediaUrl?: string): Promise<SocialMessage> {
    const body: Record<string, unknown> = {
      recipients: [conversationId],
      text: content,
    };

    if (mediaUrl) {
      body.attachments = [{ media: mediaUrl }];
    }

    const result = await this._request<{ id: string }>(
      'POST',
      '/messages',
      body,
      account,
    );

    return {
      id: result.id,
      accountId: account.id,
      platform: 'linkedin',
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
    this.logger.info('Processing LinkedIn webhook', {
      event: payload.event,
      timestamp: payload.timestamp,
    });

    if (payload.event === 'share' || payload.event === 'comment') {
      this.logger.info('LinkedIn interaction webhook', {
        event: payload.event,
        data: payload.data,
      });
    }
  }

  protected isTokenExpired(account: SocialAccount): boolean {
    if (!account.tokenExpiresAt) return false;
    return Date.now() >= account.tokenExpiresAt.getTime() - 60_000;
  }

  protected buildAuthHeaders(account: SocialAccount): Record<string, string> {
    return {
      Authorization: `Bearer ${account.accessToken}`,
      'LinkedIn-Version': '202401',
    };
  }

  protected extractRateLimitInfo(response: Response): { resetAt?: Date; limit?: number } | null {
    const remaining = response.headers.get('x-ratelimit-remaining');
    const reset = response.headers.get('x-ratelimit-reset');
    const limit = response.headers.get('x-ratelimit-limit');

    if (remaining === '0' && reset) {
      return {
        resetAt: new Date(parseInt(reset, 10) * 1000),
        limit: limit ? parseInt(limit, 10) : undefined,
      };
    }

    return null;
  }

  protected extractErrorData(errorBody: string): { message: string; code: string; statusCode: number; retryable: boolean } {
    try {
      const data = JSON.parse(errorBody) as {
        message?: string;
        errorCode?: string;
        status?: number;
        subCode?: string;
      };
      return {
        message: data.message || errorBody,
        code: data.errorCode || data.subCode || 'UNKNOWN',
        statusCode: data.status || 500,
        retryable: data.errorCode === 'THROTTLED' || data.errorCode === 'RATE_LIMIT_EXCEEDED',
      };
    } catch {
      return { message: errorBody, code: 'UNKNOWN', statusCode: 500, retryable: false };
    }
  }
}