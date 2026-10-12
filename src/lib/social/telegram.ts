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

interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  edited_message?: TelegramMessage;
  channel_post?: TelegramMessage;
  edited_channel_post?: TelegramMessage;
  callback_query?: {
    id: string;
    from: TelegramUser;
    message?: TelegramMessage;
    data: string;
  };
}

interface TelegramMessage {
  message_id: number;
  from?: TelegramUser;
  chat: TelegramChat;
  date: number;
  text?: string;
  photo?: Array<{ file_id: string; file_unique_id: string; width: number; height: number; file_size?: number }>;
  video?: { file_id: string; file_unique_id: string; width: number; height: number; duration: number; file_size?: number };
  document?: { file_id: string; file_unique_id: string; file_name?: string; mime_type?: string; file_size?: number };
  caption?: string;
  reply_to_message?: TelegramMessage;
  forward_from?: TelegramUser;
  forward_from_chat?: TelegramChat;
  entities?: Array<{ type: string; offset: number; length: string; url?: string; user?: TelegramUser }>;
  media_group_id?: string;
}

interface TelegramUser {
  id: number;
  is_bot: boolean;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
}

interface TelegramChat {
  id: number;
  type: 'private' | 'group' | 'supergroup' | 'channel';
  title?: string;
  username?: string;
  first_name?: string;
  last_name?: string;
  description?: string;
  member_count?: number;
}

interface TelegramFile {
  file_id: string;
  file_unique_id: string;
  file_size?: number;
  file_path?: string;
}

interface TelegramSentMessage {
  message_id: number;
  date: number;
  chat: TelegramChat;
  text?: string;
  photo?: Array<{ file_id: string; file_unique_id: string; width: number; height: number }>;
  video?: { file_id: string; file_unique_id: string; width: number; height: number; duration: number };
  document?: { file_id: string; file_unique_id: string };
}

interface TelegramChatMember {
  user: TelegramUser;
  status: 'creator' | 'administrator' | 'member' | 'restricted' | 'left' | 'kicked';
  until_date?: number;
  can_be_edited?: boolean;
  can_post_messages?: boolean;
  can_edit_messages?: boolean;
  can_delete_messages?: boolean;
  can_invite_users?: boolean;
  can_restrict_members?: boolean;
  can_pin_messages?: boolean;
  can_manage_topics?: boolean;
  can_manage_chat?: boolean;
  can_manage_video_chats?: boolean;
  is_anonymous?: boolean;
  custom_title?: string;
}

interface TelegramChatMemberCount {
  count: number;
}

interface InlineKeyboardButton {
  text: string;
  url?: string;
  callback_data?: string;
  login_url?: { url: string; forward_text?: boolean; bot_username?: string; request_write_access?: boolean };
  switch_inline_query?: string;
  switch_inline_query_current_chat?: string;
}

interface InlineKeyboardMarkup {
  inline_keyboard: InlineKeyboardButton[][];
}

interface TelegramWebhookInfo {
  url: string;
  has_custom_certificate: boolean;
  pending_update_count: number;
  max_connections?: number;
  allowed_updates?: string[];
  ip_address?: string;
  last_error_date?: number;
  last_error_message?: string;
}

export class TelegramProvider extends BaseSocialProvider {
  readonly platform: SocialPlatform = 'telegram';

  constructor(config: OAuthConfig, logger?: Logger) {
    super({
      ...config,
      authUrl: config.authUrl || '',
      tokenUrl: config.tokenUrl || '',
      apiUrl: config.apiUrl || `https://api.telegram.org/bot${config.clientId}`,
    }, logger);
  }

  protected async exchangeCodeForToken(_code: string): Promise<{
    accessToken: string;
    refreshToken?: string;
    expiresIn?: number;
  }> {
    throw new SocialError(
      'Telegram uses bot token authentication, not OAuth2 code exchange',
      'telegram',
      'NOT_APPLICABLE',
    );
  }

  async authenticate(code: string): Promise<SocialAccount> {
    const botToken = code || this.config.clientId;

    const me = await this._request<{ id: number; first_name: string; username?: string; is_bot: boolean }>(
      'GET',
      '/getMe',
      undefined,
      { ...this.createAccount({ accessToken: botToken }, '', ''), accessToken: botToken },
    );

    return this.createAccount(
      { accessToken: botToken, expiresIn: undefined },
      me.id.toString(),
      me.username || me.first_name,
      { botId: me.id, isBot: me.is_bot, firstName: me.first_name },
    );
  }

  async refreshToken(account: SocialAccount): Promise<SocialAccount> {
    return account;
  }

  async publishPost(account: SocialAccount, options: SocialPublishOptions): Promise<SocialPost> {
    const chatId = options.targeting?.chatId;
    if (!chatId) {
      throw new SocialError('Telegram posts require chatId in targeting', 'telegram', 'CHAT_ID_REQUIRED');
    }

    const parseMode = options.targeting?.parseMode || 'HTML';
    const disableNotification = options.targeting?.disableNotification === 'true';

    let result: TelegramSentMessage;

    if (options.mediaUrls && options.mediaUrls.length > 0) {
      const mediaUrl = options.mediaUrls[0];

      if (mediaUrl.endsWith('.mp4') || mediaUrl.endsWith('.mov') || mediaUrl.endsWith('.avi')) {
        result = await this.sendVideo(account, chatId, mediaUrl, options.content, {
          parse_mode: parseMode,
          disable_notification: disableNotification,
        });
      } else if (mediaUrl.endsWith('.pdf') || mediaUrl.endsWith('.doc') || mediaUrl.endsWith('.docx') || mediaUrl.endsWith('.txt')) {
        result = await this.sendDocument(account, chatId, mediaUrl, options.content, {
          parse_mode: parseMode,
          disable_notification: disableNotification,
        });
      } else {
        result = await this.sendPhoto(account, chatId, mediaUrl, options.content, {
          parse_mode: parseMode,
          disable_notification: disableNotification,
        });
      }
    } else {
      result = await this._request<{ result: TelegramSentMessage }>(
        'POST',
        '/sendMessage',
        {
          chat_id: chatId,
          text: options.content,
          parse_mode: parseMode,
          disable_notification: disableNotification,
        },
        account,
      ).then((r) => r.result);
    }

    return this.createPost(
      account.id,
      options.content,
      `${chatId}:${result.message_id}`,
      options.mediaUrls,
    );
  }

  async sendTextMessage(
    account: SocialAccount,
    chatId: string,
    text: string,
    options?: {
      parse_mode?: string;
      disable_notification?: boolean;
      reply_to_message_id?: number;
      reply_markup?: InlineKeyboardMarkup;
    },
  ): Promise<TelegramSentMessage> {
    const body: Record<string, unknown> = {
      chat_id: chatId,
      text,
      ...options,
    };

    const response = await this._request<{ result: TelegramSentMessage }>('POST', '/sendMessage', body, account);
    return response.result;
  }

  async sendPhoto(
    account: SocialAccount,
    chatId: string,
    photoUrl: string,
    caption?: string,
    options?: {
      parse_mode?: string;
      disable_notification?: boolean;
      reply_to_message_id?: number;
      reply_markup?: InlineKeyboardMarkup;
    },
  ): Promise<TelegramSentMessage> {
    const body: Record<string, unknown> = {
      chat_id: chatId,
      photo: photoUrl,
      ...options,
    };

    if (caption) {
      body.caption = caption;
    }

    const response = await this._request<{ result: TelegramSentMessage }>('POST', '/sendPhoto', body, account);
    return response.result;
  }

  async sendVideo(
    account: SocialAccount,
    chatId: string,
    videoUrl: string,
    caption?: string,
    options?: {
      parse_mode?: string;
      disable_notification?: boolean;
      reply_to_message_id?: number;
      reply_markup?: InlineKeyboardMarkup;
      duration?: number;
      width?: number;
      height?: number;
      supports_streaming?: boolean;
    },
  ): Promise<TelegramSentMessage> {
    const body: Record<string, unknown> = {
      chat_id: chatId,
      video: videoUrl,
      supports_streaming: true,
      ...options,
    };

    if (caption) {
      body.caption = caption;
    }

    const response = await this._request<{ result: TelegramSentMessage }>('POST', '/sendVideo', body, account);
    return response.result;
  }

  async sendDocument(
    account: SocialAccount,
    chatId: string,
    documentUrl: string,
    caption?: string,
    options?: {
      parse_mode?: string;
      disable_notification?: boolean;
      reply_to_message_id?: number;
      reply_markup?: InlineKeyboardMarkup;
    },
  ): Promise<TelegramSentMessage> {
    const body: Record<string, unknown> = {
      chat_id: chatId,
      document: documentUrl,
      ...options,
    };

    if (caption) {
      body.caption = caption;
    }

    const response = await this._request<{ result: TelegramSentMessage }>('POST', '/sendDocument', body, account);
    return response.result;
  }

  async sendInlineKeyboard(
    account: SocialAccount,
    chatId: string,
    text: string,
    keyboard: InlineKeyboardMarkup,
    options?: {
      parse_mode?: string;
      disable_notification?: boolean;
      reply_to_message_id?: number;
    },
  ): Promise<TelegramSentMessage> {
    return this.sendTextMessage(account, chatId, text, {
      ...options,
      reply_markup: keyboard,
    });
  }

  async deletePost(account: SocialAccount, postId: string): Promise<void> {
    const [chatId, messageId] = postId.split(':');
    if (!chatId || !messageId) {
      throw new SocialError('Invalid Telegram post ID format. Expected chatId:messageId', 'telegram', 'INVALID_POST_ID');
    }

    await this._request<{ ok: boolean; result: boolean }>(
      'POST',
      '/deleteMessage',
      { chat_id: Number(chatId), message_id: Number(messageId) },
      account,
    );
  }

  async deleteMessage(account: SocialAccount, chatId: string | number, messageId: number): Promise<void> {
    await this._request<{ ok: boolean; result: boolean }>(
      'POST',
      '/deleteMessage',
      { chat_id: Number(chatId), message_id: messageId },
      account,
    );
  }

  async getAnalytics(account: SocialAccount, period: { start: Date; end: Date }): Promise<SocialAnalytics> {
    const botInfo = await this._request<{ id: number; first_name: string; username?: string; is_bot: boolean }>(
      'GET',
      '/getMe',
      undefined,
      account,
    );

    const targetChatId = account.metadata?.defaultChatId as string | undefined;
    let memberCount = 0;

    if (targetChatId) {
      try {
        const countResponse = await this._request<{ ok: boolean; result: TelegramChatMemberCount }>(
          'POST',
          '/getChatMemberCount',
          { chat_id: Number(targetChatId) },
          account,
        );
        memberCount = countResponse.result.count;
      } catch {
        this.logger.warn('Failed to get Telegram chat member count');
      }
    }

    return {
      followers: memberCount,
      following: 0,
      postsCount: 0,
      engagementRate: 0,
      reach: memberCount,
      impressions: memberCount,
      period,
    };
  }

  async getComments(account: SocialAccount, postId: string): Promise<SocialComment[]> {
    const [chatId, messageId] = postId.split(':');
    if (!chatId || !messageId) {
      throw new SocialError('Invalid Telegram post ID format', 'telegram', 'INVALID_POST_ID');
    }

    const updates = await this._request<{ ok: boolean; result: TelegramUpdate[] }>(
      'POST',
      '/getUpdates',
      {
        allowed_updates: ['message'],
        offset: 0,
        limit: 100,
      },
      account,
    );

    const comments: SocialComment[] = [];
    for (const update of updates.result) {
      const msg = update.message;
      if (
        msg &&
        msg.reply_to_message &&
        msg.reply_to_message.message_id === Number(messageId) &&
        msg.chat.id === Number(chatId)
      ) {
        comments.push({
          id: `${update.update_id}`,
          postId,
          platform: 'telegram' as SocialPlatform,
          authorName: msg.from?.first_name || 'Unknown',
          authorUsername: msg.from?.username || String(msg.from?.id || ''),
          content: msg.text || msg.caption || '[Media]',
          createdAt: new Date(msg.date * 1000),
          isReply: false,
        });
      }
    }

    return comments;
  }

  async replyToComment(account: SocialAccount, commentId: string, content: string): Promise<SocialComment> {
    const [chatId, replyToMessageId] = commentId.split(':');

    const result = await this._request<{ result: TelegramSentMessage }>(
      'POST',
      '/sendMessage',
      {
        chat_id: Number(chatId),
        text: content,
        reply_to_message_id: Number(replyToMessageId),
      },
      account,
    );

    return {
      id: `${result.result.message_id}`,
      postId: commentId,
      platform: 'telegram',
      authorName: account.platformUsername,
      authorUsername: account.platformAccountId,
      content,
      createdAt: new Date(),
      isReply: true,
    };
  }

  async getMessages(account: SocialAccount, conversationId?: string): Promise<SocialMessage[]> {
    const chatId = conversationId || (account.metadata?.defaultChatId as string | undefined);
    if (!chatId) {
      throw new SocialError('A chat ID is required to fetch Telegram messages', 'telegram', 'CHAT_ID_REQUIRED');
    }

    const updates = await this._request<{ ok: boolean; result: TelegramUpdate[] }>(
      'POST',
      '/getUpdates',
      {
        allowed_updates: ['message'],
        offset: 0,
        limit: 100,
      },
      account,
    );

    const messages: SocialMessage[] = [];
    for (const update of updates.result) {
      const msg = update.message;
      if (msg && String(msg.chat.id) === chatId) {
        const isInbound = !msg.from?.is_bot;

        let mediaUrl: string | undefined;
        if (msg.photo && msg.photo.length > 0) {
          const largestPhoto = msg.photo[msg.photo.length - 1];
          const file = await this._request<{ ok: boolean; result: TelegramFile }>(
            'POST',
            '/getFile',
            { file_id: largestPhoto.file_id },
            account,
          );
          if (file.result.file_path) {
            mediaUrl = `https://api.telegram.org/file/bot${account.accessToken}/${file.result.file_path}`;
          }
        }

        if (msg.video) {
          const file = await this._request<{ ok: boolean; result: TelegramFile }>(
            'POST',
            '/getFile',
            { file_id: msg.video.file_id },
            account,
          );
          if (file.result.file_path) {
            mediaUrl = `https://api.telegram.org/file/bot${account.accessToken}/${file.result.file_path}`;
          }
        }

        messages.push({
          id: String(update.update_id),
          accountId: account.id,
          platform: 'telegram' as SocialPlatform,
          conversationId: chatId,
          direction: isInbound ? 'inbound' : 'outbound',
          content: msg.text || msg.caption || '[Media]',
          mediaUrl,
          senderName: msg.from?.first_name || 'Bot',
          senderId: String(msg.from?.id || 0),
          createdAt: new Date(msg.date * 1000),
          isRead: !isInbound,
        });
      }
    }

    return messages;
  }

  async sendMessage(account: SocialAccount, conversationId: string, content: string, mediaUrl?: string): Promise<SocialMessage> {
    let result: TelegramSentMessage;

    if (mediaUrl) {
      if (mediaUrl.endsWith('.mp4') || mediaUrl.endsWith('.mov')) {
        result = await this.sendVideo(account, conversationId, mediaUrl, content);
      } else {
        result = await this.sendPhoto(account, conversationId, mediaUrl, content);
      }
    } else {
      result = await this.sendTextMessage(account, conversationId, content);
    }

    return {
      id: String(result.message_id),
      accountId: account.id,
      platform: 'telegram',
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

  async setWebhook(account: SocialAccount, webhookUrl: string, allowedUpdates?: string[]): Promise<boolean> {
    const body: Record<string, unknown> = { url: webhookUrl };
    if (allowedUpdates) {
      body.allowed_updates = allowedUpdates;
    }

    const result = await this._request<{ ok: boolean; description: string }>(
      'POST',
      '/setWebhook',
      body,
      account,
    );

    return result.ok;
  }

  async getWebhookInfo(account: SocialAccount): Promise<TelegramWebhookInfo> {
    const result = await this._request<{ ok: boolean; result: TelegramWebhookInfo }>(
      'GET',
      '/getWebhookInfo',
      undefined,
      account,
    );

    return result.result;
  }

  async deleteWebhook(account: SocialAccount): Promise<boolean> {
    const result = await this._request<{ ok: boolean; description: string }>(
      'POST',
      '/deleteWebhook',
      undefined,
      account,
    );

    return result.ok;
  }

  async getChatMember(account: SocialAccount, chatId: string | number, userId: number): Promise<TelegramChatMember> {
    const result = await this._request<{ ok: boolean; result: TelegramChatMember }>(
      'POST',
      '/getChatMember',
      { chat_id: Number(chatId), user_id: userId },
      account,
    );

    return result.result;
  }

  async banChatMember(
    account: SocialAccount,
    chatId: string | number,
    userId: number,
    untilDate?: Date,
    revokeMessages?: boolean,
  ): Promise<boolean> {
    const body: Record<string, unknown> = {
      chat_id: Number(chatId),
      user_id: userId,
      revoke_messages: revokeMessages ?? false,
    };

    if (untilDate) {
      body.until_date = Math.floor(untilDate.getTime() / 1000);
    }

    const result = await this._request<{ ok: boolean; result: boolean }>(
      'POST',
      '/banChatMember',
      body,
      account,
    );

    return result.ok;
  }

  async unbanChatMember(
    account: SocialAccount,
    chatId: string | number,
    userId: number,
    onlyIfBanned?: boolean,
  ): Promise<boolean> {
    const result = await this._request<{ ok: boolean; result: boolean }>(
      'POST',
      '/unbanChatMember',
      {
        chat_id: Number(chatId),
        user_id: userId,
        only_if_banned: onlyIfBanned ?? true,
      },
      account,
    );

    return result.ok;
  }

  async getChatMemberCount(account: SocialAccount, chatId: string | number): Promise<number> {
    const result = await this._request<{ ok: boolean; result: TelegramChatMemberCount }>(
      'POST',
      '/getChatMemberCount',
      { chat_id: Number(chatId) },
      account,
    );

    return result.result.count;
  }

  processUpdate(update: TelegramUpdate): SocialWebhookPayload | null {
    const message = update.message || update.edited_message || update.channel_post || update.edited_channel_post;
    if (message) {
      return {
        platform: 'telegram',
        event: message.chat.type === 'channel' ? 'channel_post' : 'message',
        data: {
          update_id: update.update_id,
          message_id: message.message_id,
          chat_id: message.chat.id,
          from: message.from,
          text: message.text,
          date: message.date,
          photo: message.photo,
          video: message.video,
          document: message.document,
          reply_to_message: message.reply_to_message
            ? { message_id: message.reply_to_message.message_id, from: message.reply_to_message.from }
            : undefined,
        },
        timestamp: new Date().toISOString(),
      };
    }

    if (update.callback_query) {
      return {
        platform: 'telegram',
        event: 'callback_query',
        data: {
          id: update.callback_query.id,
          from: update.callback_query.from,
          data: update.callback_query.data,
          message: update.callback_query.message
            ? { message_id: update.callback_query.message.message_id, chat_id: update.callback_query.message.chat.id }
            : undefined,
        },
        timestamp: new Date().toISOString(),
      };
    }

    return null;
  }

  verifyWebhook(payload: SocialWebhookPayload, _signature: string): boolean {
    if (this.config.clientSecret) {
      const expectedHash = crypto.createHash('sha256').update(this.config.clientSecret).digest('hex').substring(0, 8);
      const tokenHash = crypto.createHash('sha256').update(this.config.clientId).digest('hex').substring(0, 8);
      return expectedHash === tokenHash;
    }
    return true;
  }

  async handleWebhook(payload: SocialWebhookPayload): Promise<void> {
    this.logger.info('Processing Telegram webhook', {
      event: payload.event,
      timestamp: payload.timestamp,
    });

    if (payload.event === 'message') {
      this.logger.info('Telegram message received', { data: payload.data });
    }

    if (payload.event === 'callback_query') {
      this.logger.info('Telegram callback query received', { data: payload.data });
    }
  }

  protected isTokenExpired(_account: SocialAccount): boolean {
    return false;
  }

  protected buildAuthHeaders(account: SocialAccount): Record<string, string> {
    return {};
  }

  protected extractRateLimitInfo(response: Response): { resetAt?: Date; limit?: number } | null {
    const retryAfter = response.headers.get('retry-after');
    if (retryAfter) {
      return {
        resetAt: new Date(Date.now() + parseInt(retryAfter, 10) * 1000),
        limit: 30,
      };
    }

    if (response.status === 429) {
      return {
        resetAt: new Date(Date.now() + 60_000),
        limit: 30,
      };
    }

    return null;
  }

  protected extractErrorData(errorBody: string): { message: string; code: string; statusCode: number; retryable: boolean } {
    try {
      const data = JSON.parse(errorBody) as {
        ok: boolean;
        description?: string;
        error_code?: number;
        parameters?: { migrate_to_chat_id?: number; retry_after?: number };
      };

      return {
        message: data.description || errorBody,
        code: data.error_code ? `TELEGRAM_${data.error_code}` : 'UNKNOWN',
        statusCode: data.error_code === 401 ? 401 : data.error_code === 429 ? 429 : 500,
        retryable: data.error_code === 429 || (data.parameters?.retry_after !== undefined),
      };
    } catch {
      return { message: errorBody, code: 'UNKNOWN', statusCode: 500, retryable: false };
    }
  }
}