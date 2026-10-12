import type {
  SocialAccount,
  SocialAnalytics,
  SocialComment,
  SocialMessage,
  SocialMetrics,
  SocialPlatform,
  SocialPost,
  SocialPublishOptions,
  SocialWebhookPayload,
  OAuthConfig,
} from './types';
import { BaseSocialProvider } from './base-provider';
import { FacebookProvider } from './facebook';
import { LinkedInProvider } from './linkedin';
import { TwitterProvider } from './twitter';
import { YouTubeProvider } from './youtube';
import { TikTokProvider } from './tiktok';
import { PinterestProvider } from './pinterest';
import { TelegramProvider } from './telegram';
import { SocialError } from './types';

export {
  BaseSocialProvider,
  FacebookProvider,
  LinkedInProvider,
  TwitterProvider,
  YouTubeProvider,
  TikTokProvider,
  PinterestProvider,
  TelegramProvider,
};

export type {
  SocialAccount,
  SocialPlatform,
  SocialPost,
  SocialMetrics,
  SocialComment,
  SocialMessage,
  SocialAnalytics,
  OAuthConfig,
  SocialPublishOptions,
  SocialWebhookPayload,
};

export {
  SocialError,
  RateLimitError,
  AuthenticationError,
  TokenExpiredError,
  DEFAULT_RETRY_CONFIG,
} from './types';

export type { RetryConfig } from './types';
export type { Logger } from './base-provider';

export class SocialRegistry {
  private static providers = new Map<SocialPlatform, BaseSocialProvider>();
  private static configs = new Map<SocialPlatform, OAuthConfig>();

  static register(platform: SocialPlatform, provider: BaseSocialProvider): void {
    SocialRegistry.providers.set(platform, provider);
  }

  static unregister(platform: SocialPlatform): boolean {
    return SocialRegistry.providers.delete(platform);
  }

  static getProvider(platform: SocialPlatform): BaseSocialProvider {
    const provider = SocialRegistry.providers.get(platform);
    if (!provider) {
      throw new SocialError(
        `No provider registered for platform: ${platform}`,
        platform,
        'PROVIDER_NOT_REGISTERED',
      );
    }
    return provider;
  }

  static hasProvider(platform: SocialPlatform): boolean {
    return SocialRegistry.providers.has(platform);
  }

  static getRegisteredPlatforms(): SocialPlatform[] {
    return Array.from(SocialRegistry.providers.keys());
  }

  static registerConfig(platform: SocialPlatform, config: OAuthConfig): void {
    SocialRegistry.configs.set(platform, config);
  }

  static getConfig(platform: SocialPlatform): OAuthConfig | undefined {
    return SocialRegistry.configs.get(platform);
  }

  static async authenticate(platform: SocialPlatform, code: string): Promise<SocialAccount> {
    const provider = SocialRegistry.getProvider(platform);
    return provider.authenticate(code);
  }

  static async refreshToken(platform: SocialPlatform, account: SocialAccount): Promise<SocialAccount> {
    const provider = SocialRegistry.getProvider(platform);
    return provider.refreshToken(account);
  }

  static async publishPost(
    platform: SocialPlatform,
    account: SocialAccount,
    options: SocialPublishOptions,
  ): Promise<SocialPost> {
    const provider = SocialRegistry.getProvider(platform);
    return provider.publishPost(account, options);
  }

  static async deletePost(platform: SocialPlatform, account: SocialAccount, postId: string): Promise<void> {
    const provider = SocialRegistry.getProvider(platform);
    return provider.deletePost(account, postId);
  }

  static async getAnalytics(
    platform: SocialPlatform,
    account: SocialAccount,
    period: { start: Date; end: Date },
  ): Promise<SocialAnalytics> {
    const provider = SocialRegistry.getProvider(platform);
    return provider.getAnalytics(account, period);
  }

  static async getComments(
    platform: SocialPlatform,
    account: SocialAccount,
    postId: string,
  ): Promise<SocialComment[]> {
    const provider = SocialRegistry.getProvider(platform);
    return provider.getComments(account, postId);
  }

  static async replyToComment(
    platform: SocialPlatform,
    account: SocialAccount,
    commentId: string,
    content: string,
  ): Promise<SocialComment> {
    const provider = SocialRegistry.getProvider(platform);
    return provider.replyToComment(account, commentId, content);
  }

  static async getMessages(
    platform: SocialPlatform,
    account: SocialAccount,
    conversationId?: string,
  ): Promise<SocialMessage[]> {
    const provider = SocialRegistry.getProvider(platform);
    return provider.getMessages(account, conversationId);
  }

  static async sendMessage(
    platform: SocialPlatform,
    account: SocialAccount,
    conversationId: string,
    content: string,
    mediaUrl?: string,
  ): Promise<SocialMessage> {
    const provider = SocialRegistry.getProvider(platform);
    return provider.sendMessage(account, conversationId, content, mediaUrl);
  }

  static async verifyWebhook(
    platform: SocialPlatform,
    payload: SocialWebhookPayload,
    signature: string,
  ): Promise<boolean> {
    const provider = SocialRegistry.getProvider(platform);
    return provider.verifyWebhook(payload, signature);
  }

  static async handleWebhook(platform: SocialPlatform, payload: SocialWebhookPayload): Promise<void> {
    const provider = SocialRegistry.getProvider(platform);
    return provider.handleWebhook(payload);
  }

  static async publishToAll(
    platforms: SocialPlatform[],
    accounts: Map<SocialPlatform, SocialAccount>,
    options: SocialPublishOptions,
  ): Promise<Map<SocialPlatform, SocialPost>> {
    const results = new Map<SocialPlatform, SocialPost>();

    const entries = platforms.map((platform) => ({
      platform,
      account: accounts.get(platform),
      promise: (async () => {
        const account = accounts.get(platform);
        if (!account) {
          throw new SocialError(
            `No account provided for platform: ${platform}`,
            platform,
            'ACCOUNT_MISSING',
          );
        }
        return SocialRegistry.publishPost(platform, account, options);
      })(),
    }));

    for (const entry of entries) {
      try {
        const post = await entry.promise;
        results.set(entry.platform, post);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        results.set(entry.platform, {
          id: '',
          accountId: entry.account?.id ?? '',
          platform: entry.platform,
          content: options.content,
          mediaUrls: options.mediaUrls,
          status: 'failed',
        });
      }
    }

    return results;
  }

  static clear(): void {
    SocialRegistry.providers.clear();
    SocialRegistry.configs.clear();
  }
}

const providerFactory: Record<
  Exclude<SocialPlatform, 'whatsapp'>,
  new (config: OAuthConfig, logger?: import('./base-provider').Logger) => BaseSocialProvider
> = {
  facebook: FacebookProvider,
  instagram: FacebookProvider,
  linkedin: LinkedInProvider,
  twitter: TwitterProvider,
  youtube: YouTubeProvider,
  tiktok: TikTokProvider,
  pinterest: PinterestProvider,
  telegram: TelegramProvider,
};

export function createSocialProvider(platform: SocialPlatform, config: OAuthConfig, logger?: import('./base-provider').Logger): BaseSocialProvider {
  const ProviderClass = providerFactory[platform as Exclude<SocialPlatform, 'whatsapp'>];

  if (!ProviderClass) {
    throw new SocialError(
      `No provider available for platform: ${platform}`,
      platform,
      'PROVIDER_NOT_FOUND',
    );
  }

  return new ProviderClass(config, logger);
}

export function registerAllPlatforms(configs: Map<SocialPlatform, OAuthConfig>, logger?: import('./base-provider').Logger): void {
  for (const [platform, config] of configs) {
    try {
      const provider = createSocialProvider(platform, config, logger);
      SocialRegistry.register(platform, provider);
      SocialRegistry.registerConfig(platform, config);
    } catch {
      // Skip platforms without providers
    }
  }
}

export function getAuthUrl(
  platform: SocialPlatform,
  config: OAuthConfig,
  state: string,
  extraParams?: Record<string, string>,
): string {
  const provider = createSocialProvider(platform, config);

  switch (platform) {
    case 'twitter': {
      const twitterProvider = provider as TwitterProvider;
      const { codeChallenge } = twitterProvider.generatePKCE();
      return twitterProvider.generateAuthUrl(state, codeChallenge);
    }
    case 'youtube': {
      const youtubeProvider = provider as YouTubeProvider;
      return youtubeProvider.generateAuthUrl(state);
    }
    case 'pinterest': {
      const pinterestProvider = provider as PinterestProvider;
      return pinterestProvider.generateAuthUrl(state);
    }
    case 'facebook': {
      const params = new URLSearchParams({
        client_id: config.clientId,
        redirect_uri: config.redirectUri,
        scope: config.scopes.join(','),
        state,
        response_type: 'code',
      });
      if (extraParams) {
        for (const [key, value] of Object.entries(extraParams)) {
          params.set(key, value);
        }
      }
      return `${config.authUrl}?${params.toString()}`;
    }
    case 'linkedin': {
      const params = new URLSearchParams({
        client_id: config.clientId,
        redirect_uri: config.redirectUri,
        scope: config.scopes.join(' '),
        state,
        response_type: 'code',
      });
      return `${config.authUrl}?${params.toString()}`;
    }
    case 'tiktok': {
      const params = new URLSearchParams({
        client_key: config.clientId,
        redirect_uri: config.redirectUri,
        scope: config.scopes.join(','),
        state,
        response_type: 'code',
      });
      return `${config.authUrl}?${params.toString()}`;
    }
    default: {
      const params = new URLSearchParams({
        client_id: config.clientId,
        redirect_uri: config.redirectUri,
        scope: config.scopes.join(','),
        state,
        response_type: 'code',
      });
      return `${config.authUrl}?${params.toString()}`;
    }
  }
}