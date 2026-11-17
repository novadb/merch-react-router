/** `/{region}/search`: full-text search over products (with facets) and pages; the query is the parameter `q`. */
import { Link } from "react-router";
import type { Route } from "./+types/search";
import type { Ctx } from "~/components/Content";
import { preloadPictures, Range } from "~/components/Range";
import { SearchBox } from "~/components/SearchBox";
import { MARKET, REGIONS, useText, type Region } from "~/lib/i18n";
import { rangeOf, searchFilter, type Sort } from "~/lib/products";
import { loadProducts } from "~/lib/products.server";
import { queryOf, regionOf } from "~/lib/request";
import { PRODUCT_SEARCH_FIELDS } from "~/lib/schema";
import { loadGroups, searchPages } from "~/lib/site.server";

/** The search for the query's fields: `q`, and the range's facets and sorting. Opened without a query, the page lists every product. */
async function searchData(region: Region, query: URLSearchParams) {
  const market = MARKET[region];
  const q = (query.get("q") ?? "").trim();
  const productFilter = searchFilter(q, PRODUCT_SEARCH_FIELDS);
  const [products, pages, groups] = await Promise.all([
    loadProducts(region, market, productFilter, productFilter ? "$score" : undefined),
    searchPages(region, q, 5),
    loadGroups(region),
  ]);
  const defaultSort: Sort = productFilter ? "relevance" : "name";
  const alternates = Object.fromEntries(REGIONS.map((r) => [r, `/${r}/search`])) as Record<Region, string>;
  return {
    region, market, q,
    alternates,
    range: rangeOf(products, query, defaultSort),
    pages: pages.map((p) => ({ url: p.url, title: p.title })),
    groupNames: Object.fromEntries(groups),
  };
}

export const loader = ({ params, request }: Route.LoaderArgs) => searchData(regionOf(params.region), queryOf(request));

/** A new search, filter, sorting or "Show more" on the page in view: the pictures of the first cards load before the answer is shown (as in `page.tsx`). */
export async function clientLoader({ request, serverLoader }: Route.ClientLoaderArgs) {
  const data = await serverLoader();
  if (new URL(request.url).pathname === location.pathname) await preloadPictures(data.range.items);
  return data;
}

export default function SearchRoute({ loaderData: data }: Route.ComponentProps) {
  const text = useText();
  const ctx: Ctx = { region: data.region, market: data.market, text, products: {}, targets: {}, images: {} };
  return (
    <>
      {/* No canonical/hreflang: internal search results are not meant to be indexed. */}
      <title>{`${text.search} · ${text.siteName}`}</title>
      <section className="merchHero merchHero--compact">
        <p className="merchKicker">{text.search}</p>
        <h1 className="merchDisplay">{text.searchTitle(data.q)}</h1>
        {/* `key`: a new search remounts the form, so its field shows the query of the page (a default value is read once). */}
        <SearchBox key={data.q} large query={data.q} />
        {data.pages.length > 0 && (
          <nav className="search-pages" aria-label={text.pagesFound}>
            <span>{text.pagesFound}:</span>
            {data.pages.map((p) => <Link key={p.url} to={p.url}>{p.title}</Link>)}
          </nav>
        )}
      </section>
      {/* `key`: a new search starts a new range (see `page.tsx`). */}
      <Range key={data.q} ctx={ctx} range={data.range} groupNames={data.groupNames} keep={data.q ? { q: data.q } : {}} />
    </>
  );
}
