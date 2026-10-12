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

interface GoogleTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
  scope: string;
}

interface YouTubeChannel {
  id: string;
  snippet: { title: string; description: string; publishedAt: string; thumbnails: { default: { url: string } } };
  statistics: {
    viewCount: string;
    subscriberCount: string;
    videoCount: string;
    hiddenSubscriberCount: boolean;
  };
}

interface YouTubeVideo {
  id: string;
  snippet: {
    title: string;
    description: string;
    publishedAt: string;
    thumbnails: { default: { url: string } };
    channelId: string;
    channelTitle: string;
    tags?: string[];
    categoryId?: string;
  };
  status: {
    uploadStatus: string;
    privacyStatus: string;
    embeddable: boolean;
    publicStatsViewable: boolean;
  };
  contentDetails?: {
    duration: string;
    definition: string;
    caption: string;
  };
}

interface YouTubeCommentThread {
  id: string;
  snippet: {
    topLevelComment: {
      id: string;
      snippet: {
        authorDisplayName: string;
        authorChannelUrl: string;
        textDisplay: string;
        textOriginal: string;
        publishedAt: string;
        updatedAt: string;
      };
    };
    totalReplyCount: number;
    canReply: boolean;
  };
  replies?: {
    comments: Array<{
      id: string;
      snippet: {
        authorDisplayName: string;
        authorChannelUrl: string;
        textDisplay: string;
        textOriginal: string;
        publishedAt: string;
      };
    }>;
  };
}

interface YouTubeThumbnailSet {
  default: { url: string; width: number; height: number };
  medium: { url: string; width: number; height: number };
  high: { url: string; width: number; height: number };
  standard?: { url: string; width: number; height: number };
  maxres?: { url: string; width: number; height: number };
}

interface ResumableUploadResponse {
  videoId?: string;
}

export class YouTubeProvider extends BaseSocialProvider {
  readonly platform: SocialPlatform = 'youtube';

  constructor(config: OAuthConfig, logger?: Logger) {
    super({
      ...config,
      authUrl: config.authUrl || 'https://accounts.google.com/o/oauth2/v2/auth',
      tokenUrl: config.tokenUrl || 'https://oauth2.googleapis.com/token',
      apiUrl: config.apiUrl || 'https://www.googleapis.com/youtube/v3',
    }, logger);
  }

  generateAuthUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      response_type: 'code',
      scope: this.config.scopes.join(' '),
      access_type: 'offline',
      prompt: 'consent',
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
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      redirect_uri: this.config.redirectUri,
      grant_type: 'authorization_code',
    });

    const response = await fetch(this.config.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new AuthenticationError('youtube', `Failed to exchange code for token: ${errorBody}`);
    }

    const data = (await response.json()) as GoogleTokenResponse;
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in,
    };
  }

  async authenticate(code: string): Promise<SocialAccount> {
    const tokenData = await this.exchangeCodeForToken(code);

    const tempAccount = this.createAccount(tokenData, '', '');
    const channel = await this._request<{ items: YouTubeChannel[] }>(
      'GET',
      '/channels?part=snippet,statistics&mine=true',
      undefined,
      tempAccount,
    );

    if (!channel.items || channel.items.length === 0) {
      throw new SocialError('No YouTube channel found for authenticated user', 'youtube', 'CHANNEL_NOT_FOUND');
    }

    const ch = channel.items[0];
    const account = this.createAccount(tokenData, ch.id, ch.snippet.title, {
      channelId: ch.id,
      statistics: ch.statistics,
    });

    return account;
  }

  async refreshToken(account: SocialAccount): Promise<SocialAccount> {
    if (!account.refreshToken) {
      throw new AuthenticationError('youtube', 'No refresh token available');
    }

    const body = new URLSearchParams({
      refresh_token: account.refreshToken,
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      grant_type: 'refresh_token',
    });

    const response = await fetch(this.config.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    if (!response.ok) {
      throw new AuthenticationError('youtube', 'Failed to refresh YouTube token');
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

  async publishPost(account: SocialAccount, options: SocialPublishOptions): Promise<SocialPost> {
    if (!options.mediaUrls || options.mediaUrls.length === 0) {
      throw new SocialError('YouTube posts require at least one video URL', 'youtube', 'VIDEO_REQUIRED');
    }

    const videoUrl = options.mediaUrls[0];
    const channelId = (account.metadata?.channelId as string) || account.platformAccountId;

    const snippet: Record<string, unknown> = {
      title: options.content.substring(0, 100) || 'Untitled Video',
      description: options.content,
      channelId,
    };

    if (options.targeting?.tags) {
      snippet.tags = options.targeting.tags.split(',');
    }

    if (options.targeting?.categoryId) {
      snippet.categoryId = options.targeting.categoryId;
    }

    const videoResource = {
      snippet,
      status: {
        privacyStatus: options.targeting?.privacy || 'public',
        selfDeclaredMadeForKids: false,
        embeddable: true,
        publicStatsViewable: true,
      },
    };

    const videoId = await this.resumableUpload(
      account,
      videoUrl,
      videoResource,
    );

    return this.createPost(account.id, options.content, videoId, options.mediaUrls);
  }

  private async resumableUpload(
    account: SocialAccount,
    videoUrl: string,
    videoResource: Record<string, unknown>,
  ): Promise<string> {
    const videoResponse = await fetch(videoUrl);
    if (!videoResponse.ok) {
      throw new SocialError(`Failed to download video from ${videoUrl}`, 'youtube', 'VIDEO_DOWNLOAD_FAILED');
    }

    const videoBuffer = await videoResponse.arrayBuffer();
    const totalBytes = videoBuffer.byteLength;

    const uploadUrl = await this.initiateResumableUpload(account, totalBytes, videoResource);

    return this.executeResumableUpload(account, uploadUrl, videoBuffer, totalBytes);
  }

  private async initiateResumableUpload(
    account: SocialAccount,
    totalBytes: number,
    videoResource: Record<string, unknown>,
  ): Promise<string> {
    const params = new URLSearchParams({
      part: 'snippet,status',
      uploadType: 'resumable',
      notifySubscribers: 'true',
    });

    const response = await fetch(`${this.config.apiUrl}/upload/videos?${params.toString()}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${account.accessToken}`,
        'Content-Type': 'application/json',
        'X-Upload-Content-Length': totalBytes.toString(),
        'X-Upload-Content-Type': 'video/*',
        'Content-Length': '0',
      },
      body: JSON.stringify(videoResource),
    });

    if (response.status !== 200) {
      throw new SocialError('Failed to initiate YouTube resumable upload', 'youtube', 'UPLOAD_INIT_FAILED', response.status);
    }

    const location = response.headers.get('location');
    if (!location) {
      throw new SocialError('No upload URL returned from YouTube', 'youtube', 'UPLOAD_URL_MISSING');
    }

    return location;
  }

  private async executeResumableUpload(
    account: SocialAccount,
    uploadUrl: string,
    videoBuffer: ArrayBuffer,
    totalBytes: number,
  ): Promise<string> {
    const chunkSize = 10 * 1024 * 1024;
    let uploadedBytes = 0;

    while (uploadedBytes < totalBytes) {
      const endByte = Math.min(uploadedBytes + chunkSize, totalBytes);
      const chunk = videoBuffer.slice(uploadedBytes, endByte);

      const response = await fetch(uploadUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': 'video/*',
          'Content-Range': `bytes ${uploadedBytes}-${endByte - 1}/${totalBytes}`,
          Authorization: `Bearer ${account.accessToken}`,
        },
        body: chunk,
      });

      if (response.status === 308) {
        const range = response.headers.get('range');
        if (range) {
          const match = range.match(/bytes=\d+-(\d+)/);
          if (match) {
            uploadedBytes = parseInt(match[1], 10) + 1;
          }
        }
        continue;
      }

      if (response.status === 200 || response.status === 201) {
        const data = (await response.json()) as { id: string };
        return data.id;
      }

      if (response.status >= 500 && response.status < 600) {
        await this.delay(2000);
        continue;
      }

      throw new SocialError(
        `YouTube upload failed with status ${response.status}`,
        'youtube',
        'UPLOAD_FAILED',
        response.status,
        response.status >= 500,
      );
    }

    throw new SocialError('YouTube upload did not complete', 'youtube', 'UPLOAD_INCOMPLETE');
  }

  async deletePost(account: SocialAccount, postId: string): Promise<void> {
    await this._request<{ kind: string }>('DELETE', `/videos?id=${postId}`, undefined, account);
  }

  async updateVideoMetadata(
    account: SocialAccount,
    videoId: string,
    metadata: { title?: string; description?: string; tags?: string[]; categoryId?: string; privacyStatus?: string },
  ): Promise<void> {
    const snippet: Record<string, unknown> = {};
    if (metadata.title !== undefined) snippet.title = metadata.title;
    if (metadata.description !== undefined) snippet.description = metadata.description;
    if (metadata.tags !== undefined) snippet.tags = metadata.tags;
    if (metadata.categoryId !== undefined) snippet.categoryId = metadata.categoryId;

    const status: Record<string, unknown> = {};
    if (metadata.privacyStatus !== undefined) status.privacyStatus = metadata.privacyStatus;

    const body: Record<string, unknown> = { id: videoId };
    if (Object.keys(snippet).length > 0) body.snippet = snippet;
    if (Object.keys(status).length > 0) body.status = status;

    const parts: string[] = [];
    if (Object.keys(snippet).length > 0) parts.push('snippet');
    if (Object.keys(status).length > 0) parts.push('status');

    await this._request<{ kind: string }>('PUT', `/videos?part=${parts.join(',')}`, body, account);
  }

  async setThumbnail(account: SocialAccount, videoId: string, thumbnailUrl: string): Promise<YouTubeThumbnailSet> {
    const thumbnailResponse = await fetch(thumbnailUrl);
    if (!thumbnailResponse.ok) {
      throw new SocialError('Failed to download thumbnail image', 'youtube', 'THUMBNAIL_DOWNLOAD_FAILED');
    }

    const thumbnailBuffer = await thumbnailResponse.arrayBuffer();
    const formData = new FormData();

    const blob = new Blob([thumbnailBuffer], { type: 'image/jpeg' });
    formData.append('videoId', videoId);
    formData.append('thumbnailBlob', blob, 'thumbnail.jpg');

    const response = await this._uploadWithAuth(
      `${this.config.apiUrl}/thumbnails/set`,
      formData,
      account,
      'POST',
    );

    if (!response.ok) {
      const errorBody = await response.text();
      throw new SocialError(`Failed to set YouTube thumbnail: ${errorBody}`, 'youtube', 'THUMBNAIL_SET_FAILED', response.status);
    }

    return (await response.json()) as YouTubeThumbnailSet;
  }

  async getAnalytics(account: SocialAccount, period: { start: Date; end: Date }): Promise<SocialAnalytics> {
    const channelId = (account.metadata?.channelId as string) || account.platformAccountId;

    const channelResponse = await this._request<{ items: YouTubeChannel[] }>(
      'GET',
      `/channels?part=statistics&id=${channelId}`,
      undefined,
      account,
    );

    const stats = channelResponse.items?.[0]?.statistics;

    const reportResponse = await this._request<{
      rows?: Array<string[]>;
      columnHeaders?: Array<{ name: string; dataType: string }>;
    }>(
      'GET',
      `${this.config.apiUrl.replace('/v3', '')}/youtube/analytics/v1/reports?ids=channel==${channelId}&metrics=views,estimatedMinutesWatched,averageViewDuration,subscribersGained,subscribersLost&startDate=${this.formatYoutubeDate(period.start)}&endDate=${this.formatYoutubeDate(period.end)}&dimensions=day&sort=day`,
      undefined,
      account,
    ).catch(() => ({ rows: [] }));

    let impressions = 0;
    let engagementRate = 0;

    if (reportResponse.rows) {
      for (const row of reportResponse.rows) {
        impressions += parseInt(row[0], 10) || 0;
      }
    }

    return {
      followers: stats ? parseInt(stats.subscriberCount, 10) : 0,
      following: 0,
      postsCount: stats ? parseInt(stats.videoCount, 10) : 0,
      engagementRate,
      reach: Math.floor(impressions * 0.6),
      impressions,
      period,
    };
  }

  async getComments(account: SocialAccount, postId: string): Promise<SocialComment[]> {
    const comments = await this.fetchAllPaginated<YouTubeCommentThread>(
      `/commentThreads?part=snippet,replies&videoId=${postId}&maxResults=100&order=relevance`,
      account,
      'items',
    );

    const result: SocialComment[] = [];

    for (const thread of comments) {
      const topComment = thread.snippet.topLevelComment;
      result.push({
        id: topComment.id,
        postId,
        platform: 'youtube' as SocialPlatform,
        authorName: topComment.snippet.authorDisplayName,
        authorUsername: topComment.snippet.authorChannelUrl || topComment.id,
        content: topComment.snippet.textOriginal || topComment.snippet.textDisplay,
        createdAt: new Date(topComment.snippet.publishedAt),
        isReply: false,
      });

      if (thread.replies?.comments) {
        for (const reply of thread.replies.comments) {
          result.push({
            id: reply.id,
            postId,
            platform: 'youtube' as SocialPlatform,
            authorName: reply.snippet.authorDisplayName,
            authorUsername: reply.snippet.authorChannelUrl || reply.id,
            content: reply.snippet.textOriginal || reply.snippet.textDisplay,
            createdAt: new Date(reply.snippet.publishedAt),
            isReply: true,
          });
        }
      }
    }

    return result;
  }

  async replyToComment(account: SocialAccount, commentId: string, content: string): Promise<SocialComment> {
    const channelId = (account.metadata?.channelId as string) || account.platformAccountId;

    const result = await this._request<{ id: string; snippet: { authorDisplayName: string; textOriginal: string; publishedAt: string } }>(
      'POST',
      '/comments?part=snippet',
      {
        snippet: {
          parentId: commentId,
          channelId,
          textOriginal: content,
        },
      },
      account,
    );

    return {
      id: result.id,
      postId: commentId,
      platform: 'youtube',
      authorName: result.snippet.authorDisplayName,
      authorUsername: channelId,
      content,
      createdAt: new Date(result.snippet.publishedAt),
      isReply: true,
    };
  }

  async getMessages(_account: SocialAccount, _conversationId?: string): Promise<SocialMessage[]> {
    throw new SocialError('YouTube does not support direct messaging', 'youtube', 'NOT_SUPPORTED');
  }

  async sendMessage(_account: SocialAccount, _conversationId: string, _content: string, _mediaUrl?: string): Promise<SocialMessage> {
    throw new SocialError('YouTube does not support direct messaging', 'youtube', 'NOT_SUPPORTED');
  }

  verifyWebhook(payload: SocialWebhookPayload, signature: string): boolean {
    if (!this.config.clientSecret) return false;
    const hmac = crypto.createHmac('sha256', this.config.clientSecret);
    hmac.update(JSON.stringify(payload.data));
    const expected = hmac.digest('hex');
    try {
      return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
    } catch {
      return false;
    }
  }

  async handleWebhook(payload: SocialWebhookPayload): Promise<void> {
    this.logger.info('Processing YouTube webhook', {
      event: payload.event,
      timestamp: payload.timestamp,
    });

    if (payload.event === 'notification') {
      this.logger.info('YouTube pubsub notification received', { data: payload.data });
    }
  }

  private formatYoutubeDate(date: Date): string {
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
    const remaining = response.headers.get('x-youtube-quota-user');
    if (remaining === '0') {
      return {
        resetAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        limit: 10000,
      };
    }

    return null;
  }

  protected extractErrorData(errorBody: string): { message: string; code: string; statusCode: number; retryable: boolean } {
    try {
      const data = JSON.parse(errorBody) as {
        error?: {
          message: string;
          code: number;
          errors?: Array<{ message: string; domain: string; reason: string; location?: string; locationType?: string }>;
          status: string;
        };
      };

      if (data.error) {
        const isQuotaExceeded = data.error.errors?.some((e) => e.reason === 'quotaExceeded');
        const isRateLimit = data.error.code === 403 && isQuotaExceeded;

        return {
          message: data.error.errors?.[0]?.message || data.error.message,
          code: data.error.errors?.[0]?.reason || `ERR_${data.error.code}`,
          statusCode: data.error.code,
          retryable: isRateLimit || data.error.code >= 500,
        };
      }
    } catch {
      // ignore parse errors
    }

    return { message: errorBody, code: 'UNKNOWN', statusCode: 500, retryable: false };
  }
}