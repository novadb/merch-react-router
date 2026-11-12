/**
 * Document shell, header and footer. Rendered on the server, then hydrated: links navigate in the browser, and the
 * range, the typeahead and the shop are React components. Everything works without JavaScript.
 */
import { isRouteErrorResponse, Link, Links, Outlet, Scripts, ScrollRestoration, useMatches, useNavigation, useRouteLoaderData, type ShouldRevalidateFunctionArgs } from "react-router";
import { SearchBox } from "~/components/SearchBox";
import { ShopifyCart } from "~/components/Shop";
import { HTML_LANG, isRegion, REGION_LABEL, REGIONS, t, type Region } from "~/lib/i18n";
import { loadLabels } from "~/lib/i18n.server";
import { loadSite } from "~/lib/site.server";
import type { Route } from "./+types/root";
// `?url`: Vite builds the file under a name that carries its content hash and hands back that URL, cacheable for good.
import siteCss from "./site.css?url";

/** This demo's repository on GitHub (`github.com/novadb/<REPO>`), linked from the corner of every page. */
const REPO = "merch-react-router";

export const links: Route.LinksFunction = () => [{ rel: "stylesheet", href: siteCss }];

export async function loader({ params }: Route.LoaderArgs) {
  const region: Region = isRegion(params.region) ? params.region : "us";
  const [site, labels] = await Promise.all([loadSite(region), loadLabels(region)]);
  const nav = site.home.children.map((p) => ({ url: p.url, title: p.navTitle, children: p.children.map((c) => ({ url: c.url, title: c.navTitle })) }));
  return {
    region,
    labels,
    home: { url: site.home.url, title: site.home.title },
    nav,
    shopify: { domain: process.env.SHOPIFY_DOMAIN ?? "", token: process.env.SHOPIFY_STOREFRONT_TOKEN ?? "" },
  };
}

/** Labels, navigation and shop are the region's: loaded again only when a link leads to another region. */
export const shouldRevalidate = ({ currentParams, nextParams }: ShouldRevalidateFunctionArgs) => currentParams.region !== nextParams.region;

export function Layout({ children }: { children: React.ReactNode }) {
  const root = useRouteLoaderData<typeof loader>("root");
  const region = root?.region ?? "us";
  // Without root data (NovaDB unreachable) there are no labels: the error page then stands alone in English.
  const text = root ? t(root.labels, region) : undefined;
  // A route that returns `alternates` (region → URL of the same content) gets a correct region switch in the header.
  const alternates = (useMatches().at(-1)?.loaderData as { alternates?: Partial<Record<Region, string>> } | undefined)?.alternates;
  // While a link or a search loads the next page, the current one is marked busy until the new one replaces it.
  const navigating = useNavigation().state !== "idle";
  return (
    <html lang={HTML_LANG[region]}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Links />
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
      </head>
      {/* `data-shop`: a shop is configured; without it site.css hides the place of the buy button. */}
      <body data-shop={root?.shopify.domain && root.shopify.token ? "" : undefined}>
        <a className="skip" href="#main">{text?.skip ?? "Skip to content"}</a>
        {root && text && (
          <header className="site-header">
            <div className="site-header__inner">
              <Link className="logo" to={root.home.url}>{root.home.title}</Link>
              <nav className="site-nav" aria-label={text.mainNav}>
                <ul>
                  {root.nav.map((item) => (
                    <li key={item.url}>
                      <Link to={item.url}>{item.title}</Link>
                      {item.children.length > 0 && (
                        <ul className="site-nav__sub">
                          {item.children.map((c) => <li key={c.url}><Link to={c.url}>{c.title}</Link></li>)}
                        </ul>
                      )}
                    </li>
                  ))}
                </ul>
              </nav>
              <SearchBox />
              <div className="site-header__tools">
                <nav className="regions" aria-label={text.region}>
                  {REGIONS.map((r) => {
                    const { short, title } = REGION_LABEL[r];
                    return r === region
                      ? <span key={r} className="regions__item" aria-current="true" title={title}>{short}</span>
                      // A document load: Shopify's cart takes the region's market when the page starts.
                      : <a key={r} className="regions__item" href={alternates?.[r] ?? `/${r}/`} hrefLang={HTML_LANG[r]} title={title}>{short}</a>;
                  })}
                </nav>
              </div>
            </div>
          </header>
        )}
        <main id="main" aria-busy={navigating || undefined}>{children}</main>
        <footer className="site-footer">
          {text && <p dangerouslySetInnerHTML={text.poweredBy} />}
          <a className="site-footer__repo" href={`https://github.com/novadb/${REPO}`}>{REPO}</a>
        </footer>
        {/* The NovaDB logo in the corner: decoration only, the footer's line names NovaDB in words. */}
        <aside className="source" aria-hidden="true" />
        {root && <ShopifyCart />}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  const root = useRouteLoaderData<typeof loader>("root");
  const text = root ? t(root.labels, root.region) : undefined;
  const notFound = isRouteErrorResponse(error) && error.status === 404 && text;
  return (
    <section className="merchHero not-found">
      {text && <title>{text.siteName}</title>}
      <h1 className="merchDisplay">{notFound ? text.notFound : "Error"}</h1>
      {notFound ? <p className="merchLead" dangerouslySetInnerHTML={text.notFoundText} /> : <p className="merchLead">Something went wrong while loading this page.</p>}
      <p className="merchCta"><Link to={root?.home.url ?? "/"}>{text?.home ?? "Home"}</Link></p>
    </section>
  );
}
