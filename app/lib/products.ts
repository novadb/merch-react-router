/** Products from the PIM as the site uses them, for server and browser: the type, search terms, facets and sorting. */
import type { Image } from "./images";

/** The sellable variant of a product: SKU, colour, stock and delivery time. */
export type Article = {
  id: number;
  productId: number;
  name: string;
  sku: string;
  /** A PIM object (`merchColor`) held by ID as a string: the value of its facet checkbox. Its name and swatch come with the labels (`text.value(id)`). */
  color?: string;
  /** Pieces in stock; 0 is sold out. */
  stock: number;
  deliveryDays?: number;
};

export type Product = {
  id: number;
  name: string;
  url: string;
  /** The URL without the region, e.g. `shop/t-shirts/we-build-value`. */
  path: string;
  /** The released articles; a product that has none is shown as available, but no filter counts it. */
  articles: Article[];
  /** Materials and finishes are PIM objects (`merchMaterial`, `merchFinish`), held by ID as a string like an article's colour. */
  materials: string[];
  /** Cup volume in ml. */
  volume?: number;
  /** Sticker finishes, pieces per set, laptop sleeve screen size in inches. */
  finishes: string[];
  pieces?: number;
  screenSize?: number;
  price?: number;
  image?: Image;
  groupId?: number;
  descriptionHtml?: string;
  /** Object IDs of products: similar ones, accessories and spare parts, as an editor ordered them. */
  similar: number[];
  accessories: number[];
  spareParts: number[];
  /** The texts of the claims the product makes. */
  claims: string[];
  /** The rows of a set product: an article (by object ID) and how many of it. */
  setItems: { articleId: number; quantity: number }[];
  seo: { title?: string; description?: string; noIndex: boolean; noFollow: boolean };
  shopifyId?: string;
};

/** The colours of a product's articles, without repeats. */
export const colorsOf = (p: Product): string[] => [...new Set(p.articles.flatMap((a) => a.color ?? []))];

/** `false` is sold out (no article in stock); `undefined`: no article, shown as available, but not counted by the in-stock filter. */
export const inStockOf = (p: Product): boolean | undefined => (p.articles.length ? p.articles.some((a) => a.stock > 0) : undefined);

/** Removes the XHTML namespace the CMS stores with rich text. */
export const cleanHtml = (html: string) => html.replace(/\sxmlns="[^"]*"/g, "");

/** Lucene-safe prefix terms (`+term*`) from the first 100 characters a visitor typed; empty when nothing usable is left. */
function searchTerms(query: string): string[] {
  return query
    .slice(0, 100)
    .toLowerCase()
    .replace(/[+\-!(){}[\]^"~*?:\\/&|]/g, " ")
    .split(/\s+/)
    .filter((term) => term.length > 0)
    .slice(0, 6)
    .map((term) => `+${term}*`);
}

/** Full-text filter over the given text fields: every term must match within one field. */
export function searchFilter(query: string, fields: string[]): string | undefined {
  const terms = searchTerms(query).join(" ");
  return terms ? "(" + fields.map((f) => `${f}: ${terms}`).join(" || ") + ")" : undefined;
}

// ---- facets -------------------------------------------------------------------------------------

export const SORTS = ["relevance", "name", "price-asc", "price-desc"] as const;
export type Sort = (typeof SORTS)[number];

/**
 * Cards a range shows at first and adds per "Show more": the grid has 1, 2 or 3 columns, so a multiple of 6 always
 * fills whole rows, and 12 cover the first screen and a half below the facets. The whole range is loaded all the same,
 * because the facets are counted over all of it: batches are a matter of rendering, not of Delivery paging.
 */
export const RANGE_BATCH = 12;

/** `shown`: how many cards of the result are rendered (a multiple of `RANGE_BATCH`); facets and count cover them all. */
export type Selection = { group: number[]; color: string[]; material: string[]; stock: boolean; min?: number; max?: number; sort?: Sort; shown: number };
export type FacetValue = { value: string; count: number; selected: boolean };
export type Facets = { group: FacetValue[]; color: FacetValue[]; material: FacetValue[]; inStock: number; priceMin: number; priceMax: number };

/**
 * The filters and sorting in a query string (the range form's fields); the form's "reset" button clears them all.
 * Only the "Show more" button sends `shown`, so any other change starts again with the first batch.
 */
function parseSelection(query: URLSearchParams): Selection {
  const params = query.has("reset") ? new URLSearchParams() : query;
  const num = (key: string) => {
    const value = Number(params.get(key));
    return params.get(key) && Number.isFinite(value) ? value : undefined;
  };
  const sort = params.get("sort") as Sort;
  return {
    group: params.getAll("group").map(Number).filter(Number.isInteger),
    color: params.getAll("color"),
    material: params.getAll("material"),
    stock: params.get("stock") === "1",
    min: num("min"),
    max: num("max"),
    sort: SORTS.includes(sort) ? sort : undefined,
    shown: Math.max(1, Math.ceil((num("shown") ?? 0) / RANGE_BATCH)) * RANGE_BATCH,
  };
}

/** The facets with a list of values; a new one needs its values here, or the lookup does not compile. */
type ListFacet = "group" | "color" | "material";
type Facet = ListFacet | "stock" | "price";
const facetValues = (p: Product, facet: ListFacet): string[] =>
  ({ group: p.groupId ? [String(p.groupId)] : [], color: colorsOf(p), material: p.materials })[facet];

/** Whether a product passes every selected facet except `skip` (so a facet's own counts stay open). */
function passes(p: Product, s: Selection, skip?: Facet): boolean {
  const any = (facet: ListFacet, selected: string[]) =>
    skip === facet || !selected.length || facetValues(p, facet).some((v) => selected.includes(v));
  return (
    any("group", s.group.map(String)) && any("color", s.color) && any("material", s.material) &&
    (skip === "stock" || !s.stock || inStockOf(p) === true) &&
    (skip === "price" || ((s.min === undefined || (p.price ?? 0) >= s.min) && (s.max === undefined || (p.price ?? Infinity) <= s.max)))
  );
}

/**
 * A facet's values. The list is stable: every value of the unfiltered range, most products first, whatever is selected,
 * so a filter change moves no row. `count` is what the other facets leave of it and may be 0.
 */
function count(products: Product[], s: Selection, facet: ListFacet, selected: string[]): FacetValue[] {
  const totals = new Map<string, number>();
  const counts = new Map<string, number>();
  for (const p of products) {
    for (const v of facetValues(p, facet)) {
      totals.set(v, (totals.get(v) ?? 0) + 1);
      if (passes(p, s, facet)) counts.set(v, (counts.get(v) ?? 0) + 1);
    }
  }
  for (const v of selected) if (!totals.has(v)) totals.set(v, 0);
  return [...totals]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([value]) => ({ value, count: counts.get(value) ?? 0, selected: selected.includes(value) }));
}

/** Applies the selection and counts each facet over the products the other facets let through. */
function applySelection(products: Product[], s: Selection, defaultSort: Sort): { items: Product[]; facets: Facets } {
  const prices = products.map((p) => p.price).filter((v): v is number => v !== undefined);
  const facets: Facets = {
    group: count(products, s, "group", s.group.map(String)),
    color: count(products, s, "color", s.color),
    material: count(products, s, "material", s.material),
    inStock: products.filter((p) => inStockOf(p) && passes(p, s, "stock")).length,
    priceMin: prices.length ? Math.floor(Math.min(...prices)) : 0,
    priceMax: prices.length ? Math.ceil(Math.max(...prices)) : 0,
  };
  const items = products.filter((p) => passes(p, s));
  const sort = s.sort ?? defaultSort;
  const byPrice = (a: Product, b: Product) => (a.price ?? Infinity) - (b.price ?? Infinity);
  if (sort === "name") items.sort((a, b) => a.name.localeCompare(b.name));
  if (sort === "price-asc") items.sort(byPrice);
  if (sort === "price-desc") items.sort((a, b) => byPrice(b, a));
  return { items, facets }; // "relevance" keeps the order the products came in
}

/** A range as a page shows it: the cards rendered (one batch or more), the total and the facets of the whole result. */
export type RangeData = { items: Product[]; total: number; facets: Facets; selection: Selection; defaultSort: Sort };

/** The range of `products` for the query's fields (none: the page as opened): filtered, sorted, counted, cut to the cards shown. */
export function rangeOf(products: Product[], query: URLSearchParams, defaultSort: Sort): RangeData {
  const selection = parseSelection(query);
  const { items, facets } = applySelection(products, selection, defaultSort);
  return { items: items.slice(0, selection.shown), total: items.length, facets, selection, defaultSort };
}
