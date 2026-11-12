/** `/{region}/search`: full-text search over products (with facets) and pages; the query is the posted field `q`. */
import { useEffect } from "react";
import { Link, type ShouldRevalidateFunctionArgs } from "react-router";
import type { Route } from "./+types/search";
import type { Ctx } from "~/components/Content";
import { preloadPictures, Range } from "~/components/Range";
import { SearchBox } from "~/components/SearchBox";
import { MARKET, REGIONS, useText, type Region } from "~/lib/i18n";
import { rangeOf, searchFilter, type Sort } from "~/lib/products";
import { loadProducts } from "~/lib/products.server";
import { formOf, regionOf } from "~/lib/request";
import { PRODUCT_SEARCH_FIELDS } from "~/lib/schema";
import { loadGroups, searchPages } from "~/lib/site.server";

/** The search for the posted fields: `q`, and the range's facets and sorting. Opened without a query, the page lists every product. */
async function searchData(region: Region, form: URLSearchParams) {
  const market = MARKET[region];
  const q = (form.get("q") ?? "").trim();
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
    range: rangeOf(products, form, defaultSort),
    pages: pages.map((p) => ({ url: p.url, title: p.title })),
    groupNames: Object.fromEntries(groups),
  };
}

export const loader = ({ params }: Route.LoaderArgs) => searchData(regionOf(params.region), new URLSearchParams());

/** A search form, or the range form of the results (which carries `q` along), posts here. */
export const action = async ({ params, request }: Route.ActionArgs) => searchData(regionOf(params.region), await formOf(request));

/** In the browser the pictures of the answer's first cards are loaded before it is shown: none pops in. */
export async function clientAction({ serverAction }: Route.ClientActionArgs) {
  const answer = await serverAction();
  await preloadPictures(answer.range.items);
  return answer;
}

/** After a search the answer is the page: there is nothing to load again. */
export const shouldRevalidate = ({ formMethod, defaultShouldRevalidate }: ShouldRevalidateFunctionArgs) => !formMethod && defaultShouldRevalidate;

export default function SearchRoute({ loaderData, actionData }: Route.ComponentProps) {
  const text = useText();
  const data = actionData ?? loaderData;
  // A search starts at the top of its results. React Router keeps the scroll position after a posted form (it is
  // usually a change to the page in view), and every search is one. Not for the page as opened: back and forward
  // restore its position.
  useEffect(() => {
    if (actionData) scrollTo({ top: 0, behavior: "instant" });
  }, [actionData]);
  const ctx: Ctx = { region: data.region, market: data.market, text, products: {}, targets: {}, images: {} };
  return (
    <>
      {/* No canonical/hreflang: internal search results are not meant to be indexed. */}
      <title>{`${text.search} · ${text.siteName}`}</title>
      <section className="merchHero merchHero--compact">
        <p className="merchKicker">{text.search}</p>
        <h1 className="merchDisplay">{text.searchTitle(data.q)}</h1>
        {/* `key`: a new search remounts the form, so its field shows the query of the answer (a default value is read once). */}
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
