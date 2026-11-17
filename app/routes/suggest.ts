import type { Route } from "./+types/suggest";
import { formatPrice, MARKET } from "~/lib/i18n";
import { smallSrc } from "~/lib/images";
import { searchFilter } from "~/lib/products";
import { loadProducts } from "~/lib/products.server";
import { queryOf, regionOf } from "~/lib/request";
import { PRODUCT_SEARCH_FIELDS } from "~/lib/schema";
import { searchPages } from "~/lib/site.server";

/** The typeahead's answer: up to 5 products and 3 pages. */
export type Suggestions = {
  products: { name: string; url: string; image: string | null; price: string }[];
  pages: { title: string; url: string }[];
};

/** GET /api/suggest?lang=&q= → `Suggestions` (JSON) for the typeahead (`SearchBox.tsx`). */
export async function loader({ request }: Route.LoaderArgs) {
  const query = queryOf(request);
  const region = regionOf(query.get("lang"));
  const q = (query.get("q") ?? "").trim();
  const productFilter = q.length >= 2 ? searchFilter(q, PRODUCT_SEARCH_FIELDS) : undefined;
  if (!productFilter) return Response.json({ products: [], pages: [] } satisfies Suggestions);

  const market = MARKET[region];
  const [products, pages] = await Promise.all([loadProducts(region, market, productFilter, "$score", 5), searchPages(region, q, 3)]);
  return Response.json({
    products: products.map((p) => ({
      name: p.name, url: p.url, image: p.image ? smallSrc(p.image.src) : null, price: formatPrice(p.price, market, region),
    })),
    pages: pages.map((p) => ({ title: p.title, url: p.url })),
  } satisfies Suggestions);
}
