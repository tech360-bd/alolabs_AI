# Browser verification screenshots

Captured from the local dev server (`next dev`, port 3011) with headless Chromium
at the five widths the brief requires. Full-page, after scrolling to the bottom and
back so scroll-reveal sections are in their revealed state.

These exist so a reviewer can see the rendered result without rebuilding the
environment. They are review artifacts, not product assets — downscaled to 1400px
wide and WebP-compressed so they stay reasonable in Git.

| File | What it shows |
|---|---|
| `home-390` | Homepage on mobile: hero, solution families, services, trust, footer |
| `home-768` | Homepage at tablet |
| `home-1024` | Homepage at laptop |
| `home-1440` | Homepage at desktop |
| `home-1920` | Homepage at wide desktop |
| `solutions-390` / `solutions-1440` | The twelve-solution hub |
| `projects-390` / `projects-1440` | Case-study index, including the honest audit table (stacked as labelled cards below 720px) |
| `start-a-project-390` / `start-a-project-1440` | Conversion flow with the real enquiry form |
| `platform-overview-1440` | AgentOS five-layer presentation with Live / Partial / Planned states |

Measured alongside each capture: exactly one `<h1>` per page, no horizontal
overflow, no element wider than the viewport, and zero console errors.
