# ALO Labs AIOS — Social Media Integration Guide

> **Version:** 0.2.0  
> **Last Updated:** 2025  
> **Audience:** Developers and integration specialists

---

## Table of Contents

1. [Supported Platforms](#1-supported-platforms)
2. [OAuth2 Setup for Each Platform](#2-oauth2-setup-for-each-platform)
3. [Provider Configuration](#3-provider-configuration)
4. [Account Connection Flow](#4-account-connection-flow)
5. [Post Publishing Workflow](#5-post-publishing-workflow)
6. [Analytics Tracking](#6-analytics-tracking)
7. [Webhook Configuration](#7-webhook-configuration)
8. [Rate Limits per Platform](#8-rate-limits-per-platform)
9. [Token Refresh Mechanism](#9-token-refresh-mechanism)
10. [Multi-Account Management](#10-multi-account-management)
11. [Troubleshooting](#11-troubleshooting)

---

## 1. Supported Platforms

The social media integration system (defined in `src/lib/social/types.ts`) supports nine platforms:

| Platform | Type | Key Features | OAuth Version |
|---|---|---|---|
| **Facebook** | Social Network | Pages, Groups, Ads | OAuth 2.0 |
| **Instagram** | Media | Posts, Stories, Reels | OAuth 2.0 (via Facebook) |
| **LinkedIn** | Professional | Posts, Articles, Company Pages | OAuth 2.0 |
| **Twitter/X** | Microblogging | Posts, DMs, Spaces | OAuth 2.0 |
| **YouTube** | Video | Videos, Shorts, Comments | OAuth 2.0 |
| **TikTok** | Short Video | Videos, Comments | OAuth 2.0 |
| **Pinterest** | Visual Discovery | Pins, Boards | OAuth 2.0 |
| **Telegram** | Messaging | Channels, Groups, Bots | Bot API |
| **WhatsApp** | Messaging | Business API | Business API |

### Platform Type Definitions

```typescript
type SocialPlatform =
  | 'facebook' | 'instagram' | 'linkedin' | 'twitter'
  | 'youtube' | 'tiktok' | 'pinterest' | 'telegram' | 'whatsapp';
```

---

## 2. OAuth2 Setup for Each Platform

### Facebook

1. Go to [Meta for Developers](https://developers.facebook.com/)
2. Create a new App → **Business** type
3. Add **Facebook Login** product
4. Configure OAuth redirect URI:
   ```
   https://panel.alolabs.net/api/auth/oauth/facebook/callback
   ```
5. Required permissions: `pages_manage_posts`, `pages_read_engagement`, `public_profile`
6. Copy **App ID** and **App Secret**

### Instagram (via Facebook)

1. Use the same Facebook App as above
2. Add **Instagram** product to the app
3. Link your Instagram Business/Creator account to a Facebook Page
4. Required permissions: `instagram_basic`, `instagram_content_publish`
5. Instagram uses the same OAuth flow as Facebook

### LinkedIn

1. Go to [LinkedIn Developer Portal](https://developer.linkedin.com/)
2. Create a new App
3. Add **Sign In with LinkedIn** and **Marketing Developer Platform** products
4. Redirect URI:
   ```
   https://panel.alolabs.net/api/auth/oauth/linkedin/callback
   ```
5. Required scopes: `r_liteprofile`, `r_emailaddress`, `w_member_social`
6. Copy **Client ID** and **Client Secret**

### Twitter/X

1. Go to [Twitter Developer Portal](https://developer.twitter.com/)
2. Create a new Project and App
3. Set OAuth 2.0 redirect URI:
   ```
   https://panel.alolabs.net/api/auth/oauth/twitter/callback
   ```
4. Enable **OAuth 2.0 with PKCE**
5. Required scopes: `tweet.read`, `tweet.write`, `users.read`
6. Copy **API Key** and **API Secret**

### YouTube (via Google)

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a project or select existing
3. Enable **YouTube Data API v3**
4. Create OAuth 2.0 credentials → **Web application**
5. Add redirect URI:
   ```
   https://panel.alolabs.net/api/auth/oauth/google/callback
   ```
6. Required scopes: `https://www.googleapis.com/auth/youtube.upload`

### TikTok

1. Go to [TikTok for Developers](https://developers.tiktok.com/)
2. Create an App
3. Set redirect URI:
   ```
   https://panel.alolabs.net/api/auth/oauth/tiktok/callback
   ```
4. Required scopes: `user.info.basic`, `video.publish`
5. Copy **Client Key** and **Client Secret**

### Pinterest

1. Go to [Pinterest Developers](https://developers.pinterest.com/)
2. Create a new App
3. Set redirect URI:
   ```
   https://panel.alolabs.net/api/auth/oauth/pinterest/callback
   ```
4. Required scopes: `boards:read`, `pins:read`, `pins:write`
5. Copy **App ID** and **App Secret**

### Telegram

1. Create a bot via [@BotFather](https://t.me/botfather) on Telegram
2. Send `/newbot` and follow the prompts
3. Copy the **Bot Token**
4. No OAuth redirect needed — uses Bot API directly
5. For channel posting, add the bot as an admin to the channel

### WhatsApp (Business API)

1. Go to [Meta Business Suite](https://business.facebook.com/)
2. Navigate to **WhatsApp** → **API Setup**
3. Add a phone number and verify it
4. Copy the **Phone Number ID** and **Business Account ID**
5. Generate a **Permanent Access Token**
6. Configure webhook endpoint for incoming messages

---

## 3. Provider Configuration

### OAuthConfig Interface

Each platform's OAuth configuration follows this structure:

```typescript
interface OAuthConfig {
  clientId: string;       // App ID / Client ID
  clientSecret: string;   // App Secret / Client Secret
  redirectUri: string;    // Callback URL
  scopes: string[];       // Required permission scopes
  authUrl: string;        // Authorization endpoint
  tokenUrl: string;       // Token exchange endpoint
  apiUrl: string;         // API base URL
}
```

### Storing Provider Configuration

Platform credentials are stored in the `SocialAccount` model in the database:

| Field | Description |
|---|---|
| `platform` | Platform identifier (`facebook`, `twitter`, etc.) |
| `platformAccountId` | Platform's user/page ID |
| `platformUsername` | Platform username/handle |
| `accessToken` | Encrypted access token |
| `refreshToken` | Encrypted refresh token (if applicable) |
| `tokenExpiresAt` | Token expiration timestamp |
| `isActive` | Whether the connection is active |

---

## 4. Account Connection Flow

### Step-by-Step Connection Process

```
User clicks "Connect Facebook"
        │
        ▼
GET /api/auth/oauth/facebook
        │
        ▼
Redirect to Facebook OAuth consent screen
        │
        ▼
User grants permissions
        │
        ▼
Facebook redirects to callback
/api/auth/oauth/facebook/callback?code=AUTH_CODE
        │
        ▼
Server exchanges code for tokens
POST facebook.com/oauth/access_token
        │
        ▼
Store SocialAccount record in database
(accessToken, refreshToken, expiresAt)
        │
        ▼
Redirect user back to settings panel
```

### OAuth Route

The OAuth callback is handled by `src/app/api/auth/oauth/[provider]/route.ts`.

### Listing Connected Accounts

```bash
GET /api/auth/oauth/providers
Authorization: Bearer <token>
```

Response:

```json
{
  "providers": [
    {
      "platform": "facebook",
      "connected": true,
      "username": "alolabs",
      "connectedAt": "2025-01-10T08:00:00Z"
    },
    {
      "platform": "twitter",
      "connected": false
    }
  ]
}
```

---

## 5. Post Publishing Workflow

### Create and Publish a Post

**Step 1: Create a post draft**

```typescript
const post: SocialPost = {
  accountId: "social_account_id",
  platform: "twitter",
  content: "Hello from ALO Labs AIOS! 🚀",
  mediaUrls: ["https://storage.alolabs.net/image.png"],
  status: "draft"
};
```

**Step 2: Schedule or publish immediately**

```bash
POST /api/social/publish
Authorization: Bearer <token>
Content-Type: application/json

{
  "accountId": "social_account_id",
  "content": "Hello from ALO Labs AIOS! 🚀",
  "platform": "twitter",
  "scheduledAt": "2025-01-20T12:00:00Z",
  "mediaUrls": ["https://storage.alolabs.net/image.png"]
}
```

**Step 3: Track status**

Post status transitions:

```
draft → scheduled → published
                  → failed
```

### Post Status Reference

| Status | Description |
|---|---|
| `draft` | Post created but not yet scheduled |
| `scheduled` | Post queued for future publication |
| `published` | Successfully published to the platform |
| `failed` | Publication failed (check error details) |

### Supported Post Types by Platform

| Platform | Text | Image | Video | Carousel | Story/Reel |
|---|---|---|---|---|---|
| Facebook | ✅ | ✅ | ✅ | ✅ | ❌ |
| Instagram | ✅ | ✅ | ✅ | ❌ | ✅ |
| LinkedIn | ✅ | ✅ | ✅ | ❌ | ❌ |
| Twitter/X | ✅ | ✅ (1-4) | ✅ | ❌ | ❌ |
| YouTube | ✅ | ❌ | ✅ | ❌ | ✅ (Shorts) |
| TikTok | ✅ | ❌ | ✅ | ❌ | ❌ |
| Pinterest | ✅ | ✅ | ✅ | ✅ (Idea Pins) | ❌ |

---

## 6. Analytics Tracking

### SocialMetrics Structure

```typescript
interface SocialMetrics {
  likes: number;
  comments: number;
  shares: number;
  impressions: number;
  clicks: number;
  engagementRate: number;
}
```

### SocialAnalytics Structure

```typescript
interface SocialAnalytics {
  followers: number;
  following: number;
  postsCount: number;
  engagementRate: number;
  reach: number;
  impressions: number;
  period: { start: Date; end: Date };
}
```

### Retrieving Analytics

Analytics are updated via webhooks (when supported) and periodic polling. Access analytics through the CRM Connections panel or API.

---

## 7. Webhook Configuration

### Incoming Webhooks

Some platforms push data to your server when events occur (new comments, messages, likes).

#### Webhook Payload Structure

```typescript
interface SocialWebhookPayload {
  platform: SocialPlatform;
  event: string;           // "comment.created", "message.received", etc.
  data: Record<string, unknown>;
  timestamp: string;
  signature?: string;      // HMAC signature for verification
}
```

#### Webhook Verification

Incoming webhooks are verified using the `WEBHOOK_SECRET` environment variable:

```typescript
// Verify HMAC-SHA256 signature
const expected = crypto
  .createHmac('sha256', process.env.WEBHOOK_SECRET)
  .update(payload)
  .digest('hex');
```

### Platform-Specific Webhook Events

| Platform | Events | Setup Method |
|---|---|---|
| Facebook | Comments, Reactions, Messages | Meta App Dashboard → Webhooks |
| Instagram | Comments, Mentions | Meta App Dashboard → Webhooks |
| Twitter/X | Mentions, DMs | Twitter Developer Portal |
| YouTube | Comments, Subscribers | Google Cloud Pub/Sub |
| Telegram | Messages, Callback Queries | Bot API (automatic) |
| WhatsApp | Messages, Status | Meta Business API → Webhooks |

### Webhook Endpoint

```
POST /api/webhooks
```

Register webhook URLs in the Webhooks panel (`/api/webhooks`).

---

## 8. Rate Limits per Platform

| Platform | Rate Limit | Window | Notes |
|---|---|---|---|
| **Facebook** | 200 posts/page/day | Daily | Per Page |
| **Instagram** | 25 posts/day | Daily | Business accounts |
| **LinkedIn** | 100 posts/day | Daily | Per user |
| **Twitter/X** | 50 posts/3 hours | 3 hours | Per user |
| **YouTube** | 100 uploads/day | Daily | Per channel |
| **TikTok** | 100 uploads/day | Daily | Per user |
| **Pinterest** | 150 pins/day | Daily | Per user |
| **Telegram** | 20 msg/sec | 1 second | Per bot |
| **WhatsApp** | 80 msg/sec | 1 second | Per number |

### Rate Limit Error Handling

When a rate limit is exceeded, the system throws `RateLimitError`:

```typescript
class RateLimitError extends SocialError {
  constructor(platform: SocialPlatform, resetAt: Date, limit: number) {
    super(
      `Rate limit exceeded for ${platform}. Resets at ${resetAt.toISOString()}`,
      platform, 'RATE_LIMIT_EXCEEDED', 429, true
    );
  }
}
```

The system automatically retries with exponential backoff (default config):

```typescript
const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
};
```

---

## 9. Token Refresh Mechanism

### Token Expiration Handling

Each `SocialAccount` record tracks `tokenExpiresAt`. When a token is about to expire or has expired, the system uses the `refreshToken` to obtain a new `accessToken`.

### Automatic Refresh Flow

```
API Request → Check tokenExpiresAt
                │
         Expired or < 5 min remaining?
                │
        ┌───────┴───────┐
        ▼               ▼
       Yes              No
        │               │
  POST tokenUrl      Use existing
  {refresh_token}    access_token
        │
        ▼
  Update SocialAccount
  (accessToken, tokenExpiresAt)
        │
        ▼
  Retry original request
```

### TokenExpiredError

When a refresh fails (e.g., user revoked access):

```typescript
class TokenExpiredError extends AuthenticationError {
  constructor(platform: SocialPlatform) {
    super(platform, 'Access token has expired');
    this.retryable = true;  // System will attempt refresh
  }
}
```

### Platform-Specific Token Lifetimes

| Platform | Access Token Lifetime | Refresh Token Lifetime |
|---|---|---|
| Facebook | 60 days | 60 days |
| Instagram | 60 days | 60 days |
| LinkedIn | 60 days | 365 days |
| Twitter/X | 2 hours | N/A (use refresh_token) |
| YouTube | 1 hour | N/A (use refresh_token) |
| TikTok | 24 hours | 365 days |
| Pinterest | 30 days | N/A |
| Telegram | Indefinite | N/A |
| WhatsApp | 24 hours | 365 days |

---

## 10. Multi-Account Management

### Connecting Multiple Accounts

The system supports connecting multiple accounts per platform per company:

```typescript
// Each SocialAccount is linked to a company
interface SocialAccount {
  id: string;
  companyId: string;        // Links to the company
  platform: SocialPlatform;
  platformAccountId: string; // Unique per platform
  platformUsername: string;
  accessToken: string;
  refreshToken?: string;
  tokenExpiresAt?: Date;
  isActive: boolean;
}
```

### Publishing to Multiple Accounts

To publish the same content across multiple platforms or accounts:

```bash
POST /api/social/publish
{
  "accountIds": ["account_1_id", "account_2_id", "account_3_id"],
  "content": "Cross-platform post content",
  "mediaUrls": ["https://storage.alolabs.net/image.png"]
}
```

### Account Status Management

- **Active:** Account is connected and can publish
- **Inactive:** Account is disconnected (user revoked, token expired permanently)
- **Expired:** Token needs refresh (system handles automatically)

---

## 11. Troubleshooting

### OAuth Callback Fails with "redirect_uri_mismatch"

**Cause:** The redirect URI in the platform's developer console doesn't match the application's callback URL.

**Solution:** Ensure the redirect URI exactly matches:
```
https://panel.alolabs.net/api/auth/oauth/{platform}/callback
```

### Token Refresh Fails

**Cause:** User has revoked the application's access, or the refresh token has expired.

**Solution:**
1. The user must re-authenticate via the OAuth flow
2. Delete the expired `SocialAccount` record
3. Re-connect the account from the settings panel

### Rate Limit Exceeded During Batch Publish

**Cause:** Publishing to multiple accounts too quickly.

**Solution:** The system uses exponential backoff with `DEFAULT_RETRY_CONFIG` (3 retries, 1s base delay, 2x multiplier). For large batches, add delays between publishes:

```typescript
// Stagger publishes by 2 seconds
for (const account of accounts) {
  await publish(account, content);
  await new Promise(resolve => setTimeout(resolve, 2000));
}
```

### Webhook Not Receiving Events

**Cause:** Webhook URL not properly configured or not accessible.

**Solution:**
1. Verify the webhook URL is publicly accessible (not behind auth for platform verification)
2. Check the `WEBHOOK_SECRET` matches the platform's webhook secret
3. Review the Webhooks panel for delivery logs

### Telegram Bot Not Receiving Messages

**Cause:** Bot privacy mode is enabled, or bot is not added to the group/channel.

**Solution:**
1. Via @BotFather: `/setprivacy` → Disable
2. Add the bot as an administrator to the group/channel
3. Verify the bot token is correct in the provider configuration