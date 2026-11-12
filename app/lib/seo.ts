/** Canonical URL and language/region variants (`rel="canonical"`, `rel="alternate" hreflang`) for search engines. */
import { HTML_LANG, REGIONS, type Region } from "./i18n";

export type Seo = { canonical: string; alternates: { hreflang: string; href: string }[] };

/**
 * Public origin (`https://host`) for absolute URLs: `SITE_URL` if set, else what the ingress forwards
 * (`X-Forwarded-Proto/Host`), else the request's own origin. A client can forge those headers: set `SITE_URL` in production.
 */
function originOf(request: Request): string {
  const configured = process.env.SITE_URL;
  if (configured) return configured.replace(/\/+$/, "");
  const first = (name: string) => request.headers.get(name)?.split(",")[0].trim();
  const own = new URL(request.url);
  return `${first("X-Forwarded-Proto") ?? own.protocol.replace(":", "")}://${first("X-Forwarded-Host") ?? first("Host") ?? own.host}`;
}

/**
 * `path` is the page's clean URL (no filters, sorting, tracking parameters). `variants` holds the same content in every
 * region that has it, the page itself included: every variant lists all of them, `x-default` is `/`, which picks a region.
 */
export function seoOf(request: Request, path: string, variants: Partial<Record<Region, string>>): Seo {
  const origin = originOf(request);
  const alternates = REGIONS.flatMap((region) => (variants[region] ? [{ hreflang: HTML_LANG[region], href: origin + variants[region] }] : []));
  if (alternates.length) alternates.push({ hreflang: "x-default", href: `${origin}/` });
  return { canonical: origin + path, alternates };
}
