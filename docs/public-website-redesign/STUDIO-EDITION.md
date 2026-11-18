# Public studio brand edition

The public route `/` previously used an abstract WebGL network and the document palette (`#E8501A` / `#0066CC`). The supplied reference sheet specifies **`#FF6A00` for action and `#003A8C` for system/navigation**, with gradient endpoints `#FFB300` and `#0077FF`.

- `src/lib/brand/public.ts` binds this edition to `/` and the shared `/site` chrome. The invoice, letterhead, dashboard and staff brand tokens are not migrated. The public site remains a client-facing studio, not an anonymous window into the internal operating system.
- `public/studio/alo-symbol.webp` and the square app icons are proportional, symbol-only crops from the supplied logo. The companion, processor, platform and linked-system renders are illustrations. Figure numbers identify exhibits, not running agents or live service status.
- Hero art and the first caption are server-rendered. Previous/next buttons browse the four exhibits. Optional pointer tilt respects reduced motion. The separate **Explore the 3D network** control loads the existing interactive scene only on request; small screens and devices without WebGL 2 get a static alternative.
- The website serves its own Latin Inter and Poppins WOFF2 subsets. Their OFL licenses are alongside the fonts in `public/studio/fonts/`.

Run the homepage component checks with `npx vitest run __tests__/components/enterprise/home-experience.test.tsx`. With the app running, `bash docs/public-website-redesign/smoke-check.sh http://localhost:3011` checks the public routes, private redirects, metadata and contact validation. No production deployment or DNS change is part of this redesign.
