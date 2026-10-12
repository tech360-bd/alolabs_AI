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

interface TwitterTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
  scope: string;
}

interface TwitterUser {
  id: string;
  name: string;
  username: string;
  public_metrics?: {
    followers_count: number;
    following_count: number;
    tweet_count: number;
    listed_count: number;
  };
}

interface TwitterTweetResponse {
  data: {
    id: string;
    text: string;
    created_at?: string;
  };
  includes?: {
    users?: TwitterUser[];
    tweets?: Array<{ id: string; text: string }>;
    media?: Array<{ media_key: string; type: string; url?: string }>;
  };
}

interface TwitterMediaUploadInit {
  media_id_string: string;
  expires_after_secs: number;
}

interface TwitterMediaUploadAppend {
  media_id_string: string;
  segment_index: number;
}

interface TwitterMediaUploadFinalize {
  media_id_string: string;
  size: number;
  expires_after_secs: number;
  processing_info?: {
    state: string;
    check_after_secs: number;
    progress_percent?: number;
  };
}

interface TwitterComment {
  id: string;
  text: string;
  author_id: string;
  created_at: string;
  in_reply_to_user_id?: string;
  referenced_tweets?: Array<{ type: string; id: string }>;
}

interface TwitterDMEvent {
  id: string;
  event_type: string;
  message_create?: {
    message_data: {
      text: string;
      attachment?: { media: { media_id: string; type_info: { category: string } } };
      entities?: { hashtags: Array<{ text: string }>; urls: Array<{ expanded_url: string; display_url: string }> };
    };
    sender_id: string;
    target: { recipient_id: string };
    created_timestamp: string;
  };
}

interface TwitterDMConversation {
  id: string;
  participants: { participant_id: string }[];
  created_timestamp: string;
}

function base64UrlEncode(buffer: Buffer): string {
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

export class TwitterProvider extends BaseSocialProvider {
  readonly platform: SocialPlatform = 'twitter';
  private pkceCodeVerifier?: string;

  constructor(config: OAuthConfig, logger?: Logger) {
    super({
      ...config,
      authUrl: config.authUrl || 'https://twitter.com/i/oauth2/authorize',
      tokenUrl: config.tokenUrl || 'https://api.twitter.com/2/oauth2/token',
      apiUrl: config.apiUrl || 'https://api.twitter.com/2',
    }, logger);
  }

  generateAuthUrl(state: string, codeChallenge: string): string {
    const scopes = this.config.scopes.join(' ');
    return `${this.config.authUrl}?response_type=code&client_id=${this.config.clientId}&redirect_uri=${encodeURIComponent(this.config.redirectUri)}&scope=${encodeURIComponent(scopes)}&state=${state}&code_challenge=${codeChallenge}&code_challenge_method=S256`;
  }

  generatePKCE(): { codeVerifier: string; codeChallenge: string } {
    const codeVerifier = base64UrlEncode(crypto.randomBytes(32));
    const challengeBuffer = crypto.createHash('sha256').update(codeVerifier).digest();
    const codeChallenge = base64UrlEncode(challengeBuffer);
    this.pkceCodeVerifier = codeVerifier;
    return { codeVerifier, codeChallenge };
  }

  setCodeVerifier(verifier: string): void {
    this.pkceCodeVerifier = verifier;
  }

  protected async exchangeCodeForToken(code: string): Promise<{
    accessToken: string;
    refreshToken?: string;
    expiresIn?: number;
  }> {
    const body = new URLSearchParams({
      code,
      grant_type: 'authorization_code',
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      code_verifier: this.pkceCodeVerifier || '',
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
      throw new AuthenticationError('twitter', `Failed to exchange code for token: ${errorBody}`);
    }

    const data = (await response.json()) as TwitterTokenResponse;
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in,
    };
  }

  async authenticate(code: string): Promise<SocialAccount> {
    const tokenData = await this.exchangeCodeForToken(code);

    const user = await this._request<{ data: TwitterUser }>(
      'GET',
      '/users/me?user.fields=public_metrics',
      undefined,
      { ...this.createAccount(tokenData, '', ''), accessToken: tokenData.accessToken },
    );

    return this.createAccount(
      tokenData,
      user.data.id,
      user.data.username,
      { publicMetrics: user.data.public_metrics },
    );
  }

  async refreshToken(account: SocialAccount): Promise<SocialAccount> {
    if (!account.refreshToken) {
      throw new AuthenticationError('twitter', 'No refresh token available');
    }

    const body = new URLSearchParams({
      refresh_token: account.refreshToken,
      grant_type: 'refresh_token',
      client_id: this.config.clientId,
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
      throw new AuthenticationError('twitter', 'Failed to refresh Twitter token');
    }

    const data = (await response.json()) as TwitterTokenResponse;
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
    let mediaIds: string[] = [];

    if (options.mediaUrls && options.mediaUrls.length > 0) {
      mediaIds = await Promise.all(options.mediaUrls.map((url) => this.uploadMedia(account, url)));
    }

    const body: Record<string, unknown> = { text: options.content };

    if (mediaIds.length > 0) {
      body.media = { media_ids: mediaIds };
    }

    if (options.scheduledAt) {
      body.scheduled_at = options.scheduledAt.toISOString();
    }

    if (options.targeting) {
      body.geo = options.targeting;
    }

    const result = await this._request<TwitterTweetResponse>('POST', '/tweets', body, account);

    return this.createPost(account.id, options.content, result.data.id, options.mediaUrls);
  }

  async deletePost(account: SocialAccount, postId: string): Promise<void> {
    await this._request<{ data: { deleted: boolean } }>('DELETE', `/tweets/${postId}`, undefined, account);
  }

  async retweet(account: SocialAccount, tweetId: string): Promise<SocialPost> {
    const result = await this._request<TwitterTweetResponse>(
      'POST',
      `/users/${account.platformAccountId}/retweets`,
      { tweet_id: tweetId },
      account,
    );

    return this.createPost(account.id, `RT: ${tweetId}`, result.data.id);
  }

  async likeTweet(account: SocialAccount, tweetId: string): Promise<void> {
    await this._request<{ data: { liked: boolean } }>(
      'POST',
      `/users/${account.platformAccountId}/likes`,
      { tweet_id: tweetId },
      account,
    );
  }

  async unlikeTweet(account: SocialAccount, tweetId: string): Promise<void> {
    await this._request<void>(
      'DELETE',
      `/users/${account.platformAccountId}/likes/${tweetId}`,
      undefined,
      account,
    );
  }

  async getAnalytics(account: SocialAccount, period: { start: Date; end: Date }): Promise<SocialAnalytics> {
    const user = await this._request<{ data: TwitterUser }>(
      'GET',
      `/users/${account.platformAccountId}?user.fields=public_metrics`,
      undefined,
      account,
    );

    const metrics = user.data.public_metrics ?? { followers_count: 0, following_count: 0, tweet_count: 0 };

    return {
      followers: metrics.followers_count,
      following: metrics.following_count,
      postsCount: metrics.tweet_count,
      engagementRate: 0,
      reach: 0,
      impressions: 0,
      period,
    };
  }

  async getComments(account: SocialAccount, postId: string): Promise<SocialComment[]> {
    const tweets = await this.fetchAllPaginated<TwitterComment>(
      `/tweets/search/recent?query=conversation_id:${postId}&tweet.fields=author_id,created_at,in_reply_to_user_id,referenced_tweets&expansions=author_id&user.fields=username,name&max_results=100`,
      account,
      'data',
    );

    return tweets.map((t) => ({
      id: t.id,
      postId,
      platform: 'twitter' as SocialPlatform,
      authorName: t.author_id,
      authorUsername: t.author_id,
      content: t.text,
      createdAt: new Date(t.created_at),
      isReply: !!t.referenced_tweets?.some((rt) => rt.type === 'replied_to'),
    }));
  }

  async replyToComment(account: SocialAccount, commentId: string, content: string): Promise<SocialComment> {
    const result = await this._request<TwitterTweetResponse>(
      'POST',
      '/tweets',
      {
        text: content,
        reply: {
          in_reply_to_tweet_id: commentId,
        },
      },
      account,
    );

    return {
      id: result.data.id,
      postId: commentId,
      platform: 'twitter',
      authorName: account.platformUsername,
      authorUsername: account.platformAccountId,
      content,
      createdAt: new Date(),
      isReply: true,
    };
  }

  async getMessages(account: SocialAccount, conversationId?: string): Promise<SocialMessage[]> {
    if (!conversationId) {
      const conversations = await this._request<{ data: TwitterDMConversation[] }>(
        'GET',
        `/dm_conversations?dm_conversation_fields=participants,created_timestamp&max_results=50`,
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
    const events = await this.fetchAllPaginated<TwitterDMEvent>(
      `/dm_conversations/${conversationId}/dm_events?dm_event_fields=event_type,message_create&expansions=sender_id&user.fields=username,name&max_results=50`,
      account,
      'data',
    );

    const accountId = account.platformAccountId;
    return events
      .filter((e) => e.event_type === 'MessageCreate' && e.message_create)
      .map((e) => {
        const mc = e.message_create!;
        const isInbound = mc.sender_id !== accountId;

        return {
          id: e.id,
          accountId: account.id,
          platform: 'twitter' as SocialPlatform,
          conversationId,
          direction: isInbound ? 'inbound' : 'outbound',
          content: mc.message_data.text,
          senderName: isInbound ? 'User' : account.platformUsername,
          senderId: mc.sender_id,
          createdAt: new Date(parseInt(mc.created_timestamp, 10)),
          isRead: !isInbound,
        };
      });
  }

  async sendMessage(account: SocialAccount, conversationId: string, content: string, mediaUrl?: string): Promise<SocialMessage> {
    const body: Record<string, unknown> = {
      text: content,
      conversation_id: conversationId,
    };

    if (mediaUrl) {
      const mediaId = await this.uploadMedia(account, mediaUrl);
      body.media = { media_id: mediaId };
    }

    const result = await this._request<{ data: { dm_event_id: string; message_data: { text: string } } }>(
      'POST',
      '/dm_conversations/with',
      body,
      account,
    );

    return {
      id: result.data.dm_event_id,
      accountId: account.id,
      platform: 'twitter',
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

  private async uploadMedia(account: SocialAccount, mediaUrl: string): Promise<string> {
    const mediaResponse = await fetch(mediaUrl);
    if (!mediaResponse.ok) {
      throw new SocialError(`Failed to download media from ${mediaUrl}`, 'twitter', 'MEDIA_DOWNLOAD_FAILED');
    }

    const arrayBuffer = await mediaResponse.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const totalBytes = buffer.length;

    const initResponse = await fetch('https://upload.twitter.com/1.1/media/upload.json?command=INIT&total_bytes=' + totalBytes + '&media_type=image/jpeg', {
      method: 'POST',
      headers: { Authorization: `Bearer ${account.accessToken}` },
    });

    if (!initResponse.ok) {
      throw new SocialError('Failed to initialize Twitter media upload', 'twitter', 'MEDIA_UPLOAD_INIT_FAILED', initResponse.status);
    }

    const initData = (await initResponse.json()) as TwitterMediaUploadInit;
    const mediaId = initData.media_id_string;

    const chunkSize = 5 * 1024 * 1024;
    let segmentIndex = 0;

    for (let offset = 0; offset < totalBytes; offset += chunkSize) {
      const chunk = buffer.subarray(offset, Math.min(offset + chunkSize, totalBytes));

      const appendForm = new FormData();
      appendForm.append('command', 'APPEND');
      appendForm.append('media_id', mediaId);
      appendForm.append('segment_index', segmentIndex.toString());
      appendForm.append('media_data', chunk.toString('base64'));

      const appendResponse = await fetch('https://upload.twitter.com/1.1/media/upload.json', {
        method: 'POST',
        headers: { Authorization: `Bearer ${account.accessToken}` },
        body: appendForm,
      });

      if (!appendResponse.ok) {
        throw new SocialError(`Failed to upload media chunk ${segmentIndex}`, 'twitter', 'MEDIA_UPLOAD_CHUNK_FAILED', appendResponse.status);
      }

      segmentIndex++;
    }

    const finalizeResponse = await fetch('https://upload.twitter.com/1.1/media/upload.json?command=FINALIZE&media_id=' + mediaId, {
      method: 'POST',
      headers: { Authorization: `Bearer ${account.accessToken}` },
    });

    if (!finalizeResponse.ok) {
      throw new SocialError('Failed to finalize Twitter media upload', 'twitter', 'MEDIA_UPLOAD_FINALIZE_FAILED', finalizeResponse.status);
    }

    const finalizeData = (await finalizeResponse.json()) as TwitterMediaUploadFinalize;

    if (finalizeData.processing_info?.state === 'pending') {
      const checkAfter = finalizeData.processing_info.check_after_secs ?? 2;
      await this.delay(checkAfter * 1000);

      for (let i = 0; i < 10; i++) {
        const statusResponse = await fetch(`https://upload.twitter.com/1.1/media/upload.json?command=STATUS&media_id=${mediaId}`, {
          method: 'GET',
          headers: { Authorization: `Bearer ${account.accessToken}` },
        });

        if (statusResponse.ok) {
          const statusData = (await statusResponse.json()) as { processing_info?: { state: string; check_after_secs?: number } };
          if (statusData.processing_info?.state === 'succeeded' || statusData.processing_info?.state === 'complete') {
            break;
          }
          if (statusData.processing_info?.state === 'failed') {
            throw new SocialError('Twitter media processing failed', 'twitter', 'MEDIA_PROCESSING_FAILED');
          }
          if (statusData.processing_info?.check_after_secs) {
            await this.delay(statusData.processing_info.check_after_secs * 1000);
          } else {
            await this.delay(3000);
          }
        }
      }
    }

    return mediaId;
  }

  verifyWebhook(payload: SocialWebhookPayload, signature: string): boolean {
    if (!this.config.clientSecret) return false;
    const hmac = crypto.createHmac('sha256', this.config.clientSecret);
    hmac.update(JSON.stringify(payload.data));
    const expected = `sha256=${hmac.digest('hex')}`;
    try {
      return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
    } catch {
      return false;
    }
  }

  async handleWebhook(payload: SocialWebhookPayload): Promise<void> {
    this.logger.info('Processing Twitter webhook', {
      event: payload.event,
      timestamp: payload.timestamp,
    });

    if (payload.event === 'tweet_create') {
      this.logger.info('Twitter tweet created webhook', { data: payload.data });
    }

    if (payload.event === 'direct_message_events') {
      this.logger.info('Twitter DM received', { data: payload.data });
    }
  }

  protected isTokenExpired(account: SocialAccount): boolean {
    if (!account.tokenExpiresAt) return false;
    return Date.now() >= account.tokenExpiresAt.getTime() - 60_000;
  }

  protected buildAuthHeaders(account: SocialAccount): Record<string, string> {
    return { Authorization: `Bearer ${account.accessToken}` };
  }

  protected extractRateLimitInfo(response: Response): { resetAt?: Date; limit?: number } | null {
    const remaining = response.headers.get('x-rate-limit-remaining');
    const reset = response.headers.get('x-rate-limit-reset');
    const limit = response.headers.get('x-rate-limit-limit');

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
        detail?: string;
        title?: string;
        errors?: Array<{ message: string; code: string; parameters?: Record<string, string> }>;
        type?: string;
      };

      const message = data.detail || data.title || data.errors?.[0]?.message || errorBody;
      const code = data.errors?.[0]?.code || data.type || 'UNKNOWN';

      const isRateLimit = data.title === 'Too Many Requests' || code === 'RATE_LIMIT_EXCEEDED';
      const isTransient = code === 'OPERATION_UNAVAILABLE' || isRateLimit;

      return {
        message,
        code,
        statusCode: isRateLimit ? 429 : 500,
        retryable: isTransient,
      };
    } catch {
      return { message: errorBody, code: 'UNKNOWN', statusCode: 500, retryable: false };
    }
  }
}