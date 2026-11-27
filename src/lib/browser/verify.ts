/**
 * Independent browser verification.
 *
 * The point of this module is that an agent's claim about a page is *checked*:
 * a real browser opens the real URL, and the result — status, title, console
 * errors, failed requests, links, screenshot bytes — is captured as evidence
 * rather than asserted in prose.
 *
 * Two honesty rules govern the implementation:
 *
 * 1. **Capability is detected, never assumed.** Playwright is an optional runtime
 *    dependency here. When it is absent, `browserCapability()` says so and
 *    `verifyPage()` returns `available: false` with the reason. It does not
 *    fabricate a pass, and callers are expected to surface that state.
 * 2. **The browser never gets a privileged destination.** The navigation policy
 *    in `navigation-guard.ts` runs before the first hop and again on every
 *    redirect, so a public URL cannot be used to reach loopback, RFC1918 space or
 *    cloud metadata.
 */

import { assertNavigableUrl, resolveAndGuardLink, type BrowserPolicy, DEFAULT_BROWSER_POLICY } from './navigation-guard';

export interface BrowserCapability {
  available: boolean;
  engine: 'playwright' | null;
  reason: string;
}

export interface BrowserLinkReport {
  href: string;
  navigable: boolean;
  reason?: string;
}

export interface BrowserEvidence {
  available: boolean;
  url: string;
  finalUrl?: string;
  status?: number;
  title?: string;
  /** Console messages at level `error` (bounded). */
  consoleErrors?: string[];
  /** Requests that never completed. */
  failedRequests?: { url: string; failure: string }[];
  /** Page errors (uncaught exceptions). */
  pageErrors?: string[];
  links?: BrowserLinkReport[];
  /** Base64 PNG, bounded. Omitted when capture is disabled or unavailable. */
  screenshotBase64?: string;
  viewport?: { width: number; height: number };
  /** Machine verdict, so a caller cannot mistake "no data" for "passed". */
  verdict: 'verified' | 'issues' | 'unavailable' | 'blocked';
  reason?: string;
  checkedAt: string;
  durationMs: number;
}

const MAX_CONSOLE = 25;
const MAX_LINKS = 200;
const MAX_SCREENSHOT_BYTES = 2_500_000;

/**
 * Is a headless browser usable in this process?
 *
 * The import is dynamic and wrapped because Playwright is optional: a deployment
 * that has not installed browsers must degrade to `available: false`, not crash a
 * route. The specifier is held in a variable so the bundler cannot fail the build
 * when the package is absent.
 */
export async function browserCapability(): Promise<BrowserCapability> {
  const specifier = 'playwright';
  try {
    const mod = (await import(/* webpackIgnore: true */ specifier)) as {
      chromium?: { executablePath?: () => string };
    };
    if (!mod.chromium?.executablePath) {
      return { available: false, engine: null, reason: 'Playwright is importable but exposes no Chromium launcher.' };
    }
    try {
      const path = mod.chromium.executablePath();
      if (!path) {
        return { available: false, engine: null, reason: 'Playwright is installed but no Chromium build is present.' };
      }
    } catch {
      return {
        available: false,
        engine: null,
        reason: 'Playwright is installed but its Chromium build is missing (`npx playwright install chromium`).',
      };
    }
    return { available: true, engine: 'playwright', reason: 'Playwright Chromium is available.' };
  } catch {
    return {
      available: false,
      engine: null,
      reason:
        'Playwright is not installed in this deployment. Install it (and a Chromium build) to enable browser ' +
        'verification; until then this endpoint reports the capability as unavailable instead of pretending.',
    };
  }
}

export interface VerifyOptions {
  url: string;
  policy?: BrowserPolicy;
  captureScreenshot?: boolean;
  timeoutMs?: number;
  viewport?: { width: number; height: number };
}

/**
 * Open a URL in an isolated context and collect evidence.
 *
 * Isolation: a fresh browser context per call (no storage state, no cookies from
 * a previous task), a fixed user agent, and `bypassCSP: false`. Downloads are
 * accepted only into memory and never written to disk.
 */
export async function verifyPage(options: VerifyOptions): Promise<BrowserEvidence> {
  const startedAt = Date.now();
  const policy = options.policy ?? DEFAULT_BROWSER_POLICY;
  const checkedAt = new Date().toISOString();
  const timeoutMs = Math.min(Math.max(options.timeoutMs ?? 20_000, 2_000), 60_000);
  const viewport = options.viewport ?? { width: 1440, height: 900 };

  const decision = assertNavigableUrl(options.url, policy);
  if (!decision.ok) {
    return {
      available: true,
      url: options.url,
      verdict: 'blocked',
      reason: `${decision.code}: ${decision.reason}`,
      checkedAt,
      durationMs: Date.now() - startedAt,
    };
  }

  const capability = await browserCapability();
  if (!capability.available) {
    return {
      available: false,
      url: decision.url,
      verdict: 'unavailable',
      reason: capability.reason,
      checkedAt,
      durationMs: Date.now() - startedAt,
    };
  }

  // Imported after the capability check so a deployment without Playwright never
  // pays the cost of the failed import twice.
  // Non-literal specifier: TypeScript cannot resolve a package that is an
  // optional peer dependency, and the deployment may not have installed it.
  const playwrightSpecifier = 'playwright';
  const { chromium } = (await import(/* webpackIgnore: true */ playwrightSpecifier)) as unknown as {
    chromium: {
      launch: (options: Record<string, unknown>) => Promise<{
        newContext: (options: Record<string, unknown>) => Promise<{
          newPage: () => Promise<{
            on: (event: string, handler: (...args: never[]) => void) => void;
            goto: (url: string, options?: Record<string, unknown>) => Promise<{ status: () => number } | null>;
            title: () => Promise<string>;
            evaluate: <T>(fn: () => T) => Promise<T>;
            screenshot: (options: Record<string, unknown>) => Promise<Buffer>;
            url: () => string;
          }>;
          close: () => Promise<void>;
        }>;
        close: () => Promise<void>;
      }>;
    };
  };

  const browser = await chromium.launch({
    headless: true,
    args: ['--disable-dev-shm-usage', '--no-sandbox', '--disable-gpu'],
  });
  const context = await browser.newContext({ viewport, bypassCSP: false, acceptDownloads: false });

  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const failedRequests: { url: string; failure: string }[] = [];

  try {
    const page = await context.newPage();

    page.on('console', ((message: { type: () => string; text: () => string }) => {
      if (message.type() === 'error' && consoleErrors.length < MAX_CONSOLE) consoleErrors.push(message.text().slice(0, 500));
    }) as never);
    page.on('pageerror', ((error: Error) => {
      if (pageErrors.length < MAX_CONSOLE) pageErrors.push(String(error?.message ?? error).slice(0, 500));
    }) as never);
    page.on('requestfailed', ((request: { url: () => string; failure: () => { errorText?: string } | null }) => {
      if (failedRequests.length < MAX_CONSOLE) {
        failedRequests.push({ url: request.url().slice(0, 500), failure: request.failure()?.errorText ?? 'unknown' });
      }
    }) as never);

    const response = await page.goto(decision.url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
    const finalUrl = page.url();

    // Every redirect is re-checked: a public host that 302s to 127.0.0.1 is the
    // standard way around a first-hop-only guard.
    const finalDecision = assertNavigableUrl(finalUrl, policy);
    if (!finalDecision.ok) {
      return {
        available: true,
        url: decision.url,
        finalUrl,
        verdict: 'blocked',
        reason: `The page redirected to a blocked destination (${finalDecision.code}): ${finalDecision.reason}`,
        checkedAt,
        durationMs: Date.now() - startedAt,
      };
    }

    const title = await page.title().catch(() => '');
    const rawLinks = await page
      .evaluate(() =>
        Array.from(document.querySelectorAll('a[href]'))
          .map((anchor) => (anchor as HTMLAnchorElement).href)
          .filter((href) => typeof href === 'string' && href.length > 0),
      )
      .catch(() => [] as string[]);

    const seen = new Set<string>();
    const links: BrowserLinkReport[] = [];
    for (const href of rawLinks) {
      if (links.length >= MAX_LINKS) break;
      if (seen.has(href)) continue;
      seen.add(href);
      const guarded = resolveAndGuardLink(finalUrl, href, policy);
      links.push({
        href: guarded.href.slice(0, 500),
        navigable: guarded.decision.ok,
        ...(guarded.decision.ok ? {} : { reason: guarded.decision.reason }),
      });
    }

    let screenshotBase64: string | undefined;
    if (options.captureScreenshot !== false) {
      const buffer = await page.screenshot({ type: 'png', fullPage: false, animations: 'disabled' }).catch(() => null);
      if (buffer && Buffer.isBuffer(buffer) && buffer.byteLength <= MAX_SCREENSHOT_BYTES) {
        screenshotBase64 = buffer.toString('base64');
      }
    }

    const brokenLinks = links.filter((link) => !link.navigable).length;
    const hasIssues = consoleErrors.length > 0 || pageErrors.length > 0 || failedRequests.length > 0;

    return {
      available: true,
      url: decision.url,
      finalUrl,
      status: response?.status() ?? 0,
      title,
      consoleErrors,
      failedRequests,
      pageErrors,
      links,
      ...(screenshotBase64 ? { screenshotBase64 } : {}),
      viewport,
      verdict: hasIssues ? 'issues' : 'verified',
      ...(hasIssues
        ? {
            reason: `${consoleErrors.length} console error(s), ${pageErrors.length} page error(s), ${failedRequests.length} failed request(s).`,
          }
        : {}),
      checkedAt,
      durationMs: Date.now() - startedAt,
    };
  } catch (error) {
    return {
      available: true,
      url: decision.url,
      verdict: 'issues',
      reason: `Navigation failed: ${error instanceof Error ? error.message : String(error)}`,
      consoleErrors,
      pageErrors,
      failedRequests,
      checkedAt,
      durationMs: Date.now() - startedAt,
    };
  } finally {
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}

/** Strip the screenshot for API responses that must stay small. */
export function withoutScreenshot(evidence: BrowserEvidence): Omit<BrowserEvidence, 'screenshotBase64'> & { hasScreenshot: boolean } {
  const { screenshotBase64, ...rest } = evidence;
  return { ...rest, hasScreenshot: Boolean(screenshotBase64) };
}
