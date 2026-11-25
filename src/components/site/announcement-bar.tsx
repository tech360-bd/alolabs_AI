/**
 * Announcement bar — DB-driven site content, end to end.
 *
 * The Super Admin Command Agent (supervisor mode) writes the
 * `home:announcement` block through the audited `set_site_content` tool;
 * this server component reads it on every request with the code default
 * (disabled) as fallback. Payload shape:
 *   { "enabled": true, "text": "Maintenance window Sunday 02:00–04:00 UTC", "href": "/status" }
 */
import { readSiteContentBlock } from '@/lib/site-content';

interface AnnouncementPayload {
  enabled?: boolean;
  text?: string;
  href?: string;
}

export default async function SiteAnnouncementBar() {
  const { value, source } = await readSiteContentBlock<AnnouncementPayload>({
    page: 'home',
    blockKey: 'announcement',
    fallback: { enabled: false },
  });

  if (source !== 'database' || !value.enabled || !value.text) return null;

  return (
    <div className="w-full bg-[#0066CC] text-white text-sm text-center px-4 py-2" role="status">
      {value.href ? (
        <a href={value.href} className="underline underline-offset-2 hover:no-underline">{value.text}</a>
      ) : (
        value.text
      )}
    </div>
  );
}
