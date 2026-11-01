/**
 * Shared view-id type for the enterprise panels.
 *
 * This used to live on `enterprise-shell.tsx`. That shell was one of three
 * parallel shells, and only one of them was ever mounted, so the panels that
 * imported the type from it were tied to a module nothing rendered. The
 * catalogue now lives in `src/lib/dashboard/navigation.ts`; panels only need the
 * shape of a view id, which is a plain string.
 *
 * A string (rather than a generated union) is deliberate: the dashboard accepts
 * 149 view ids from three merged catalogues, and an exhaustive union here would
 * force every panel to be recompiled whenever a view is added, without adding
 * real safety — `onNavigate` is always called with a literal that exists in the
 * catalogue.
 */
export type EnterpriseView = string
