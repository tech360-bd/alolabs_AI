# Browser verification report

**Status:** the *policy and evidence pipeline* are VERIFIED COMPLETE; the
*runtime browser* is BLOCKED BY EXTERNAL DEPENDENCY in this environment.

```
$ npx tsx scripts/verify-browser.ts
browser capability: UNAVAILABLE (Playwright is not installed in this deployment. …)
ssrf policy: 10 destinations blocked, 0 leaked; 2 allowed, 0 false positives
verdict: capability-unavailable
```

---

## 1. What exists

| Component | Path | Purpose |
| --- | --- | --- |
| Navigation policy | `src/lib/browser/navigation-guard.ts` | Decides whether a URL (or resolved link, or redirect hop) may be browsed |
| Verification engine | `src/lib/browser/verify.ts` | Capability detection, isolated context, evidence capture |
| API | `app/api/super-admin/browser/verify` | `GET` capability, `POST` verify one URL |
| Agent tool | `browser_verify` in `src/lib/command-agent/tools.ts` | Lets the Command Agent measure a page instead of asserting it |
| Deployment probe | `scripts/verify-browser.ts` (`npm run verify:browser`) | Reports capability + re-asserts the policy matrix |

Evidence returned per verification: HTTP status, final URL, title, console
errors, uncaught page errors, failed requests, a per-link audit (each link
resolved and guarded), viewport, duration, and whether a screenshot was captured.
Screenshots are held server-side for the run's evidence record and reported to the
client as `hasScreenshot` — a base64 page capture is large and may contain
customer data.

## 2. The SSRF boundary (the part that must never regress)

The browser tool issues outbound requests from inside the infrastructure, so the
policy is the primary control. Refused:

- loopback (`127.0.0.0/8`, `::1`, `localhost`, `localhost.`),
- private (`10/8`, `172.16/12`, `192.168/16`), link-local (`169.254/16`, `fe80::/10`),
- CGNAT (`100.64/10`), multicast and reserved ranges,
- cloud metadata (`169.254.169.254`, `metadata.google.internal`, `metadata`, `instance-data`),
- cluster/LAN suffixes (`.internal`, `.local`, `.cluster.local`, `.svc`, …),
- alternate IPv4 encodings — decimal (`2130706433`), hex (`0x7f000001`), **octal**
  (`0177.0.0.1`), short forms (`127.1`, `10.1`),
- IPv4-mapped IPv6 (`::ffff:127.0.0.1`, hex-mapped `::ffff:7f00:1`),
- non-HTTP schemes (`file:`, `javascript:`, `data:`, `ftp:`),
- URLs carrying credentials (`https://user:pass@host/`),
- operator block-list entries.

**A real bypass was found and fixed while writing the tests.** The first
implementation parsed `0177.0.0.1` as decimal 177.0.0.1 — a *public* address — while
every browser resolves it to loopback. Octal parts are now parsed as octal, and the
matrix pins it.

Redirects are re-checked: the guard runs on the first hop, and again on
`page.url()` after navigation, because a public host that 302s to `127.0.0.1` is
the standard bypass.

## 3. Why the browser is unavailable here

Playwright is not a dependency of this repository (`package.json` has no
`playwright` entry; the sandbox cannot download browser binaries because only
package-registry hosts are reachable). `browserCapability()` therefore reports:

> Playwright is not installed in this deployment. Install it (and a Chromium build)
> to enable browser verification; until then this endpoint reports the capability
> as unavailable instead of pretending.

The code path is written so that installing it is the only remaining step:

```bash
npm i -D playwright && npx playwright install --with-deps chromium
npm run verify:browser     # expected verdict: runtime-verifiable
```

## 4. What is therefore *not* claimed

- No page was opened in this environment.
- No screenshot exists in this repository as evidence.
- Items 11–15 of the Super Admin acceptance list remain incomplete for that reason
  (see `SUPER_ADMIN_ACCEPTANCE.md`).

## 5. Safety rules encoded

Isolation (fresh context per call, no storage state, CSP not bypassed, downloads
rejected), destination policy as above, bounded collection (25 console entries, 200
links, 2.5 MB screenshot cap, 2–60 s timeout), audit of both blocked and completed
navigations, and `super_admin`-only access with rate limiting.
