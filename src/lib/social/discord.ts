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

// ─── Discord API v10 Response Types ──────────────────────────────────────────

interface DiscordTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token: string;
  scope: string;
  guild_id?: string;
}

interface DiscordUser {
  id: string;
  username: string;
  discriminator: string;
  avatar?: string;
  global_name?: string;
  bot?: boolean;
  public_flags?: number;
}

interface DiscordGuild {
  id: string;
  name: string;
  icon?: string;
  owner?: boolean;
  permissions?: string;
  features?: string[];
  member_count?: number;
  approximate_member_count?: number;
  approximate_presence_count?: number;
  description?: string;
  banner?: string;
  premium_tier?: number;
  premium_subscription_count?: number;
  nsfw_level?: number;
  vanity_url_code?: string;
}

interface DiscordChannel {
  id: string;
  type: number;
  guild_id?: string;
  name?: string;
  topic?: string;
  position?: number;
  nsfw?: boolean;
  bitrate?: number;
  user_limit?: number;
  rate_limit_per_user?: number;
  last_message_id?: string;
  parent_id?: string;
  permission_overwrites?: DiscordPermissionOverwrite[];
}

interface DiscordPermissionOverwrite {
  id: string;
  type: number;
  allow?: string;
  deny?: string;
}

interface DiscordMessage {
  id: string;
  channel_id: string;
  author: DiscordUser;
  content: string;
  timestamp: string;
  edited_timestamp?: string | null;
  tts: boolean;
  mention_everyone: boolean;
  mentions: DiscordUser[];
  mention_roles: string[];
  attachments: DiscordAttachment[];
  embeds: DiscordEmbed[];
  pinned: boolean;
  type: number;
  referenced_message?: DiscordMessage | null;
  message_reference?: { message_id: string; channel_id?: string; guild_id?: string };
  guild_id?: string;
  member?: DiscordMember;
}

interface DiscordMember {
  roles: string[];
  nick?: string;
  joined_at?: string;
  premium_since?: string;
  deaf?: boolean;
  mute?: boolean;
  pending?: boolean;
  permissions?: string;
}

interface DiscordAttachment {
  id: string;
  filename: string;
  size: number;
  url: string;
  proxy_url: string;
  content_type?: string;
  width?: number;
  height?: number;
  duration?: number;
}

interface DiscordEmbed {
  type?: string;
  title?: string;
  description?: string;
  url?: string;
  timestamp?: string;
  color?: number;
  footer?: { text: string; icon_url?: string; proxy_icon_url?: string };
  image?: { url: string; proxy_url?: string; width?: number; height?: number };
  thumbnail?: { url: string; proxy_url?: string; width?: number; height?: number };
  video?: { url?: string; proxy_url?: string; width?: number; height?: number };
  provider?: { name: string; url?: string };
  author?: { name: string; url?: string; icon_url?: string; proxy_icon_url?: string };
  fields?: Array<{ name: string; value: string; inline?: boolean }>;
}

interface DiscordMessageSendResponse {
  id: string;
  channel_id: string;
  author: DiscordUser;
  content: string;
  timestamp: string;
  attachments: DiscordAttachment[];
  embeds: DiscordEmbed[];
  type: number;
}

interface DiscordGuildPreview {
  id: string;
  name: string;
  icon?: string;
  splash?: string;
  discovery_splash?: string;
  emojis: Array<{ name: string; id: string; animated: boolean }>;
  features: string[];
  approximate_member_count: number;
  approximate_presence_count: number;
  description?: string;
  stickers: unknown[];
}

interface DiscordBan {
  reason?: string;
  user: DiscordUser;
}

interface DiscordRole {
  id: string;
  name: string;
  color: number;
  hoist: boolean;
  icon?: string;
  unicode_emoji?: string;
  position: number;
  permissions: string;
  managed: boolean;
  mentionable: boolean;
}

// ─── Discord Provider ────────────────────────────────────────────────────────

export class DiscordProvider extends BaseSocialProvider {
  readonly platform: SocialPlatform = 'discord' as SocialPlatform;

  private readonly botToken?: string;

  constructor(config: OAuthConfig, logger?: Logger, botToken?: string) {
    super({
      ...config,
      authUrl:
        config.authUrl ||
        'https://discord.com/api/v10/oauth2/authorize',
      tokenUrl:
        config.tokenUrl ||
        'https://discord.com/api/v10/oauth2/token',
      apiUrl: config.apiUrl || 'https://discord.com/api/v10',
      scopes: config.scopes || [
        'bot',
        'identify',
        'guilds.read',
        'messages.read',
        'messages.send',
      ],
    }, logger);

    this.botToken = botToken || config.clientSecret;
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
        `Failed to exchange code for Discord token: ${errorBody}`,
      );
    }

    const data = (await response.json()) as DiscordTokenResponse & {
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

    const user = await this._request<DiscordUser>(
      'GET',
      '/users/@me',
      undefined,
      { ...this.createAccount(tokenData, '', ''), accessToken: tokenData.accessToken },
    );

    const guildId = await this.getDefaultGuild(tokenData.accessToken);

    return this.createAccount(
      tokenData,
      user.id,
      user.global_name || user.username,
      {
        discriminator: user.discriminator,
        avatar: user.avatar,
        isBot: user.bot ?? false,
        defaultGuildId: guildId,
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
      throw new AuthenticationError(this.platform, 'Failed to refresh Discord token');
    }

    const data = (await response.json()) as DiscordTokenResponse;
    const now = new Date();

    return {
      ...account,
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      tokenExpiresAt: new Date(now.getTime() + data.expires_in * 1000),
      updatedAt: now,
    };
  }

  // ─── Profile (Guild Info) ──────────────────────────────────────────────────

  async getProfile(account: SocialAccount): Promise<DiscordGuild> {
    const guildId = (account.metadata?.defaultGuildId as string) || account.platformAccountId;
    return this._request<DiscordGuild>('GET', `/guilds/${guildId}?with_counts=true`, undefined, account);
  }

  async getCurrentUser(account: SocialAccount): Promise<DiscordUser> {
    return this._request<DiscordUser>('GET', '/users/@me', undefined, account);
  }

  // ─── Publish Post (Send Message to Channel) ────────────────────────────────

  async publishPost(account: SocialAccount, options: SocialPublishOptions): Promise<SocialPost> {
    const channelId = options.targeting?.channelId;
    if (!channelId) {
      throw new SocialError(
        'Discord posts require channelId in targeting',
        this.platform,
        'CHANNEL_ID_REQUIRED',
      );
    }

    const body: Record<string, unknown> = { content: options.content };

    if (options.mediaUrls && options.mediaUrls.length > 0) {
      const embeds: DiscordEmbed[] = options.mediaUrls.map((url) => {
        const isVideo = url.endsWith('.mp4') || url.endsWith('.mov') || url.endsWith('.webm');
        if (isVideo) {
          return { description: options.content, video: { url } };
        }
        return { description: options.content, image: { url } };
      });
      body.embeds = embeds;

      if (embeds.length === 1 && options.content) {
        body.content = undefined;
      }
    }

    const result = await this._request<DiscordMessageSendResponse>(
      'POST',
      `/channels/${channelId}/messages`,
      body,
      account,
    );

    return this.createPost(
      account.id,
      options.content,
      `${channelId}:${result.id}`,
      options.mediaUrls,
    );
  }

  async deletePost(account: SocialAccount, postId: string): Promise<void> {
    const [channelId, messageId] = postId.split(':');
    if (!channelId || !messageId) {
      throw new SocialError(
        'Invalid Discord post ID format. Expected channelId:messageId',
        this.platform,
        'INVALID_POST_ID',
      );
    }

    await this._request<Record<string, never>>(
      'DELETE',
      `/channels/${channelId}/messages/${messageId}`,
      undefined,
      account,
    );
  }

  // ─── Analytics (Server Stats) ─────────────────────────────────────────────

  async getAnalytics(account: SocialAccount, period: { start: Date; end: Date }): Promise<SocialAnalytics> {
    const guildId = (account.metadata?.defaultGuildId as string) || account.platformAccountId;

    const [guild, channels] = await Promise.all([
      this._request<DiscordGuild>(
        'GET',
        `/guilds/${guildId}?with_counts=true`,
        undefined,
        account,
      ),
      this._request<DiscordChannel[]>(
        'GET',
        `/guilds/${guildId}/channels?limit=100`,
        undefined,
        account,
      ).catch(() => [] as DiscordChannel[]),
    ]);

    const textChannels = channels.filter((ch) => ch.type === 0);
    const totalMessages = textChannels.reduce((sum) => sum + 0, 0);

    const members = guild.approximate_member_count ?? guild.member_count ?? 0;
    const onlineMembers = guild.approximate_presence_count ?? 0;
    const engagementRate = members > 0 ? (onlineMembers / members) * 100 : 0;

    return {
      followers: members,
      following: 0,
      postsCount: textChannels.length,
      engagementRate: Math.round(engagementRate * 100) / 100,
      reach: onlineMembers,
      impressions: members,
      period,
    };
  }

  // ─── Comments (Message Replies) ────────────────────────────────────────────

  async getComments(account: SocialAccount, postId: string): Promise<SocialComment[]> {
    const [channelId, messageId] = postId.split(':');
    if (!channelId || !messageId) {
      throw new SocialError('Invalid Discord post ID format', this.platform, 'INVALID_POST_ID');
    }

    const threadMessages = await this._request<DiscordMessage[]>(
      'GET',
      `/channels/${messageId}/messages?limit=100`,
      undefined,
      account,
    ).catch(() => [] as DiscordMessage[]);

    if (threadMessages.length > 0) {
      return threadMessages
        .filter((m) => m.author.id !== account.platformAccountId)
        .map((m) => ({
          id: m.id,
          postId,
          platform: this.platform,
          authorName: m.member?.nick || m.author.global_name || m.author.username,
          authorUsername: m.author.username,
          content: m.content || '[Embed or Media]',
          createdAt: new Date(m.timestamp),
          isReply: m.referenced_message !== null && m.referenced_message !== undefined,
        }));
    }

    const referencedMessages = await this.getChannelMessages(account, channelId, 100).then((msgs) =>
      msgs.filter((m) => m.message_reference?.message_id === messageId),
    );

    return referencedMessages.map((m) => ({
      id: m.id,
      postId,
      platform: this.platform,
      authorName: m.member?.nick || m.author.global_name || m.author.username,
      authorUsername: m.author.username,
      content: m.content || '[Embed or Media]',
      createdAt: new Date(m.timestamp),
      isReply: true,
    }));
  }

  async replyToComment(account: SocialAccount, commentId: string, content: string): Promise<SocialComment> {
    const [channelId] = commentId.split(':');

    const result = await this._request<DiscordMessageSendResponse>(
      'POST',
      `/channels/${channelId}/messages`,
      {
        content,
        message_reference: { message_id: commentId.split(':').pop() },
      },
      account,
    );

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

  // ─── Messages (Channel Messages) ───────────────────────────────────────────

  async getMessages(account: SocialAccount, conversationId?: string): Promise<SocialMessage[]> {
    const channelId = conversationId || (account.metadata?.defaultChannelId as string | undefined);
    if (!channelId) {
      throw new SocialError(
        'A channel ID is required to fetch Discord messages',
        this.platform,
        'CHANNEL_ID_REQUIRED',
      );
    }

    const messages = await this.getChannelMessages(account, channelId, 100);

    return messages.map((msg) => {
      const isInbound = msg.author.id !== account.platformAccountId;
      const mediaUrl = msg.attachments?.[0]?.url;

      return {
        id: msg.id,
        accountId: account.id,
        platform: this.platform,
        conversationId: channelId,
        direction: isInbound ? 'inbound' : 'outbound',
        content: msg.content || (msg.embeds?.length ? '[Embed]' : ''),
        mediaUrl,
        senderName: msg.member?.nick || msg.author.global_name || msg.author.username,
        senderId: msg.author.id,
        createdAt: new Date(msg.timestamp),
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
    const body: Record<string, unknown> = { content };

    if (mediaUrl) {
      body.embeds = [
        {
          description: content,
          image: { url: mediaUrl },
        },
      ];
      body.content = undefined;
    }

    const result = await this._request<DiscordMessageSendResponse>(
      'POST',
      `/channels/${conversationId}/messages`,
      body,
      account,
    );

    return {
      id: result.id,
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

    const timestamp = payload.timestamp;
    const expected = crypto
      .createHmac('sha256', this.config.clientSecret)
      .update(`${timestamp}${JSON.stringify(payload.data)}`)
      .digest('hex');

    try {
      return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
    } catch {
      return false;
    }
  }

  async handleWebhook(payload: SocialWebhookPayload): Promise<void> {
    this.logger.info('Processing Discord webhook', {
      event: payload.event,
      timestamp: payload.timestamp,
    });

    if (payload.event === 'MESSAGE_CREATE') {
      this.logger.info('Discord message created', { data: payload.data });
    }

    if (payload.event === 'GUILD_MEMBER_ADD') {
      this.logger.info('Discord member joined', { data: payload.data });
    }

    if (payload.event === 'INTERACTION_CREATE') {
      this.logger.info('Discord interaction received', { data: payload.data });
    }

    if (payload.event === 'MESSAGE_REACTION_ADD') {
      this.logger.info('Discord reaction added', { data: payload.data });
    }
  }

  // ─── Additional Discord-specific Methods ──────────────────────────────────

  async getGuildChannels(account: SocialAccount, guildId?: string): Promise<DiscordChannel[]> {
    const targetGuildId = guildId || (account.metadata?.defaultGuildId as string) || account.platformAccountId;
    return this._request<DiscordChannel[]>(
      'GET',
      `/guilds/${targetGuildId}/channels`,
      undefined,
      account,
    );
  }

  async getChannelMessages(
    account: SocialAccount,
    channelId: string,
    limit: number = 50,
  ): Promise<DiscordMessage[]> {
    const result = await this._request<DiscordMessage[]>(
      'GET',
      `/channels/${channelId}/messages?limit=${limit}`,
      undefined,
      account,
    );
    return result;
  }

  async createWebhook(
    account: SocialAccount,
    channelId: string,
    name: string,
  ): Promise<{ id: string; token: string }> {
    return this._request<{ id: string; token: string }>(
      'POST',
      `/channels/${channelId}/webhooks`,
      { name },
      account,
    );
  }

  async getGuildRoles(account: SocialAccount, guildId?: string): Promise<DiscordRole[]> {
    const targetGuildId = guildId || (account.metadata?.defaultGuildId as string) || account.platformAccountId;
    return this._request<DiscordRole[]>(
      'GET',
      `/guilds/${targetGuildId}/roles`,
      undefined,
      account,
    );
  }

  async getGuildBans(account: SocialAccount, guildId?: string): Promise<DiscordBan[]> {
    const targetGuildId = guildId || (account.metadata?.defaultGuildId as string) || account.platformAccountId;
    return this._request<DiscordBan[]>(
      'GET',
      `/guilds/${targetGuildId}/bans`,
      undefined,
      account,
    );
  }

  async editMessage(
    account: SocialAccount,
    channelId: string,
    messageId: string,
    content: string,
  ): Promise<DiscordMessage> {
    return this._request<DiscordMessage>(
      'PATCH',
      `/channels/${channelId}/messages/${messageId}`,
      { content },
      account,
    );
  }

  async pinMessage(account: SocialAccount, channelId: string, messageId: string): Promise<void> {
    await this._request<Record<string, never>>(
      'PUT',
      `/channels/${channelId}/pins/${messageId}`,
      undefined,
      account,
    );
  }

  async unpinMessage(account: SocialAccount, channelId: string, messageId: string): Promise<void> {
    await this._request<Record<string, never>>(
      'DELETE',
      `/channels/${channelId}/pins/${messageId}`,
      undefined,
      account,
    );
  }

  async addReaction(account: SocialAccount, channelId: string, messageId: string, emoji: string): Promise<void> {
    await this._request<Record<string, never>>(
      'PUT',
      `/channels/${channelId}/messages/${messageId}/reactions/${encodeURIComponent(emoji)}/@me`,
      undefined,
      account,
    );
  }

  // ─── Private Helpers ───────────────────────────────────────────────────────

  private async getDefaultGuild(accessToken: string): Promise<string | undefined> {
    try {
      const guilds = await this._request<DiscordGuild[]>(
        'GET',
        '/users/@me/guilds',
        undefined,
        { ...this.createAccount({ accessToken }, '', ''), accessToken },
      );
      return guilds[0]?.id;
    } catch {
      return undefined;
    }
  }

  // ─── Protected Helpers ────────────────────────────────────────────────────

  protected isTokenExpired(account: SocialAccount): boolean {
    if (!account.tokenExpiresAt) return false;
    return Date.now() >= account.tokenExpiresAt.getTime() - 60_000;
  }

  protected buildAuthHeaders(account: SocialAccount): Record<string, string> {
    const token = this.botToken && (account.metadata?.isBot as boolean)
      ? `Bot ${this.botToken}`
      : `Bearer ${account.accessToken}`;
    return { Authorization: token };
  }

  protected extractRateLimitInfo(response: Response): { resetAt?: Date; limit?: number } | null {
    const remaining = response.headers.get('x-ratelimit-remaining');
    const resetAfter = response.headers.get('x-ratelimit-reset-after');
    const limit = response.headers.get('x-ratelimit-limit');

    if (response.status === 429 && resetAfter) {
      const resetSeconds = parseFloat(resetAfter);
      return {
        resetAt: new Date(Date.now() + resetSeconds * 1000),
        limit: limit ? parseInt(limit, 10) : 0,
      };
    }

    if (remaining === '0' && resetAfter) {
      const resetSeconds = parseFloat(resetAfter);
      return {
        resetAt: new Date(Date.now() + resetSeconds * 1000),
        limit: limit ? parseInt(limit, 10) : 50,
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
        code?: number;
        message?: string;
        errors?: Array<{ code: string; message: string }>;
      };

      const discordCode = data.code ?? 0;
      const message = data.message || errorBody;

      let retryable = false;
      if (discordCode === 429) retryable = true;
      if (discordCode === 50000 || discordCode === 50001 || discordCode === 50002 || discordCode === 50003) {
        retryable = true;
      }

      return {
        message,
        code: `DISCORD_${discordCode}`,
        statusCode: discordCode === 10001 ? 401 : discordCode === 50001 ? 403 : 500,
        retryable,
      };
    } catch {
      return { message: errorBody, code: 'UNKNOWN', statusCode: 500, retryable: false };
    }
  }
}