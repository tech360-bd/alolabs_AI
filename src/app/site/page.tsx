import { redirect } from 'next/navigation'

/**
 * `/site` was the marketing page while `/` mounted the dashboard. The root is
 * now the public site, so this duplicate would split SEO signal and keep two
 * copies of the same content in sync. Redirect permanently instead of deleting
 * the URL, so existing links (and the old nav entry) keep working.
 */
export default function SitePage() {
  redirect('/')
}
