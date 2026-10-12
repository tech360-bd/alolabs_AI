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
  RetryConfig,
} from './types';
import {
  SocialError,
  RateLimitError,
  TokenExpiredError,
  DEFAULT_RETRY_CONFIG,
} from './types';

export interface Logger {
  debug(message: string, data?: Record<string, unknown>): void;
  info(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
  error(message: string, data?: Record<string, unknown>): void;
}

const defaultLogger: Logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

export abstract class BaseSocialProvider {
  protected readonly config: OAuthConfig;
  protected readonly logger: Logger;
  protected readonly retryConfig: RetryConfig;

  constructor(config: OAuthConfig, logger?: Logger, retryConfig?: Partial<RetryConfig>) {
    this.config = config;
    this.logger = logger ?? defaultLogger;
    this.retryConfig = { ...DEFAULT_RETRY_CONFIG, ...retryConfig };
  }

  abstract readonly platform: SocialPlatform;

  abstract authenticate(code: string): Promise<SocialAccount>;
  abstract refreshToken(account: SocialAccount): Promise<SocialAccount>;
  abstract publishPost(account: SocialAccount, options: SocialPublishOptions): Promise<SocialPost>;
  abstract deletePost(account: SocialAccount, postId: string): Promise<void>;
  abstract getAnalytics(account: SocialAccount, period: { start: Date; end: Date }): Promise<SocialAnalytics>;
  abstract getComments(account: SocialAccount, postId: string): Promise<SocialComment[]>;
  abstract replyToComment(account: SocialAccount, commentId: string, content: string): Promise<SocialComment>;
  abstract getMessages(account: SocialAccount, conversationId?: string): Promise<SocialMessage[]>;
  abstract sendMessage(account: SocialAccount, conversationId: string, content: string, mediaUrl?: string): Promise<SocialMessage>;
  abstract verifyWebhook(payload: SocialWebhookPayload, signature: string): boolean;
  abstract handleWebhook(payload: SocialWebhookPayload): Promise<void>;

  protected abstract exchangeCodeForToken(code: string): Promise<{ accessToken: string; refreshToken?: string; expiresIn?: number }>;
  protected abstract isTokenExpired(account: SocialAccount): boolean;
  protected abstract buildAuthHeaders(account: SocialAccount): Record<string, string>;
  protected abstract extractRateLimitInfo(response: Response): { resetAt?: Date; limit?: number } | null;
  protected abstract extractErrorData(error: unknown): { message: string; code: string; statusCode: number; retryable: boolean };

  protected async _request<T>(
    method: string,
    path: string,
    body?: Record<string, unknown>,
    account?: SocialAccount,
  ): Promise<T> {
    const url = `${this.config.apiUrl}${path}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };

    if (account) {
      Object.assign(headers, this.buildAuthHeaders(account));
    }

    const fetchOptions: RequestInit = {
      method,
      headers,
    };

    if (body !== undefined && method !== 'GET') {
      fetchOptions.body = JSON.stringify(body);
    }

    return this._fetchWithAuth<T>(url, fetchOptions, account);
  }

  protected async _fetchWithAuth<T>(
    url: string,
    options: RequestInit,
    account?: SocialAccount,
    attempt: number = 1,
  ): Promise<T> {
    try {
      const response = await fetch(url, options);

      if (response.status === 429) {
        const rateLimitInfo = this.extractRateLimitInfo(response);
        const resetAt = rateLimitInfo?.resetAt ?? new Date(Date.now() + 60_000);
        const limit = rateLimitInfo?.limit ?? 0;

        throw new RateLimitError(this.platform, resetAt, limit);
      }

      if (response.status === 401 && account && this.isTokenExpired(account) && account.refreshToken) {
        const refreshedAccount = await this.refreshToken(account);
        const newHeaders = { ...options.headers, ...this.buildAuthHeaders(refreshedAccount) };
        return this._fetchWithAuth<T>(url, { ...options, headers: newHeaders }, refreshedAccount, attempt);
      }

      if (!response.ok) {
        const errorData = this.extractErrorData(await response.text());
        throw new SocialError(
          errorData.message,
          this.platform,
          errorData.code,
          response.status,
          errorData.retryable && attempt < this.retryConfig.maxRetries,
        );
      }

      const text = await response.text();
      if (!text) {
        return undefined as T;
      }

      return JSON.parse(text) as T;
    } catch (error) {
      if (error instanceof RateLimitError) {
        const waitMs = Math.min(
          error.resetAt.getTime() - Date.now() + 1000,
          this.retryConfig.maxDelayMs,
        );
        if (waitMs > 0 && attempt < this.retryConfig.maxRetries) {
          this.logger.warn('Rate limited, waiting before retry', {
            platform: this.platform,
            waitMs,
            attempt,
          });
          await this.delay(waitMs);
          return this._fetchWithAuth(url, options, account, attempt + 1);
        }
        throw error;
      }

      if (error instanceof SocialError) {
        if (error.retryable && attempt < this.retryConfig.maxRetries) {
          const delayMs = Math.min(
            this.retryConfig.baseDelayMs * Math.pow(this.retryConfig.backoffMultiplier, attempt - 1),
            this.retryConfig.maxDelayMs,
          );
          this.logger.warn('Retrying failed request', {
            platform: this.platform,
            attempt,
            delayMs,
            code: error.code,
          });
          await this.delay(delayMs);
          return this._fetchWithAuth(url, options, account, attempt + 1);
        }
        throw error;
      }

      if (error instanceof TokenExpiredError) {
        throw error;
      }

      const isNetworkError = error instanceof TypeError && (error as TypeError).message.includes('fetch');
      if (isNetworkError && attempt < this.retryConfig.maxRetries) {
        const delayMs = Math.min(
          this.retryConfig.baseDelayMs * Math.pow(this.retryConfig.backoffMultiplier, attempt - 1),
          this.retryConfig.maxDelayMs,
        );
        this.logger.warn('Network error, retrying', {
          platform: this.platform,
          attempt,
          delayMs,
        });
        await this.delay(delayMs);
        return this._fetchWithAuth(url, options, account, attempt + 1);
      }

      throw new SocialError(
        error instanceof Error ? error.message : 'Unknown request error',
        this.platform,
        'REQUEST_ERROR',
        undefined,
        false,
      );
    }
  }

  protected async _uploadWithAuth(
    url: string,
    formData: FormData,
    account: SocialAccount,
    method: string = 'POST',
  ): Promise<Response> {
    const headers = this.buildAuthHeaders(account);
    const options: RequestInit = {
      method,
      headers,
      body: formData,
    };

    let attempt = 1;
    while (true) {
      try {
        const response = await fetch(url, options);

        if (response.status === 429) {
          const rateLimitInfo = this.extractRateLimitInfo(response);
          const resetAt = rateLimitInfo?.resetAt ?? new Date(Date.now() + 60_000);
          const limit = rateLimitInfo?.limit ?? 0;
          throw new RateLimitError(this.platform, resetAt, limit);
        }

        if (response.status === 401 && this.isTokenExpired(account) && account.refreshToken) {
          const refreshedAccount = await this.refreshToken(account);
          const newHeaders = { ...headers, ...this.buildAuthHeaders(refreshedAccount) };
          options.headers = newHeaders;
          account = refreshedAccount;
          continue;
        }

        return response;
      } catch (error) {
        if (error instanceof RateLimitError) {
          const waitMs = Math.min(
            error.resetAt.getTime() - Date.now() + 1000,
            this.retryConfig.maxDelayMs,
          );
          if (waitMs > 0 && attempt < this.retryConfig.maxRetries) {
            await this.delay(waitMs);
            attempt++;
            continue;
          }
          throw error;
        }

        if (error instanceof SocialError) {
          throw error;
        }

        const isNetworkError = error instanceof TypeError;
        if (isNetworkError && attempt < this.retryConfig.maxRetries) {
          const delayMs = Math.min(
            this.retryConfig.baseDelayMs * Math.pow(this.retryConfig.backoffMultiplier, attempt - 1),
            this.retryConfig.maxDelayMs,
          );
          await this.delay(delayMs);
          attempt++;
          continue;
        }

        throw new SocialError(
          error instanceof Error ? error.message : 'Upload failed',
          this.platform,
          'UPLOAD_ERROR',
          undefined,
          false,
        );
      }
    }
  }

  protected generateId(): string {
    return `${this.platform}-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
  }

  protected createAccount(
    tokenData: { accessToken: string; refreshToken?: string; expiresIn?: number },
    platformAccountId: string,
    platformUsername: string,
    metadata?: Record<string, unknown>,
  ): SocialAccount {
    const now = new Date();
    return {
      id: this.generateId(),
      companyId: '',
      platform: this.platform,
      platformAccountId,
      platformUsername,
      accessToken: tokenData.accessToken,
      refreshToken: tokenData.refreshToken,
      tokenExpiresAt: tokenData.expiresIn
        ? new Date(now.getTime() + tokenData.expiresIn * 1000)
        : undefined,
      metadata,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };
  }

  protected createPost(
    accountId: string,
    content: string,
    platformPostId?: string,
    mediaUrls?: string[],
  ): SocialPost {
    return {
      id: this.generateId(),
      accountId,
      platform: this.platform,
      platformPostId,
      content,
      mediaUrls,
      publishedAt: platformPostId ? new Date() : undefined,
      status: platformPostId ? 'published' : 'draft',
    };
  }

  protected delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  protected parsePaginationUrl<T>(url: string, account: SocialAccount): Promise<{ data: T[]; nextUrl?: string }> {
    const headers: Record<string, string> = {
      Accept: 'application/json',
      ...this.buildAuthHeaders(account),
    };
    return this._fetchWithAuth<{ data: T[]; paging?: { next?: string } }>(url, {
      method: 'GET',
      headers,
    }, account).then((res) => ({
      data: res.data,
      nextUrl: res.paging?.next,
    }));
  }

  async fetchAllPaginated<T>(
    path: string,
    account: SocialAccount,
    dataKey: string = 'data',
  ): Promise<T[]> {
    const allItems: T[] = [];
    let currentPath = path;

    while (currentPath) {
      const isFullUrl = currentPath.startsWith('http');
      const url = isFullUrl ? currentPath : `${this.config.apiUrl}${currentPath}`;
      const headers: Record<string, string> = {
        Accept: 'application/json',
        ...this.buildAuthHeaders(account),
      };

      const response = await this._fetchWithAuth<Record<string, unknown>>(url, {
        method: 'GET',
        headers,
      }, account);

      const pageData = response[dataKey];
      if (Array.isArray(pageData)) {
        allItems.push(...pageData);
      }

      const paging = response.paging as { next?: string; cursors?: { after?: string } } | undefined;
      if (paging?.next) {
        currentPath = paging.next;
      } else {
        currentPath = '';
      }
    }

    return allItems;
  }
}