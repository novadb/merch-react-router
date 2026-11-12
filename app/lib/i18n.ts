/** Regions, markets and the UI texts the site prints itself (labels from NovaDB, like the content). */
import { useRouteLoaderData } from "react-router";
import type { loader as rootLoader } from "../root"; // a type only: no cycle at run time
import { PRODUCT } from "./schema";

/**
 * A region is the first URL segment (`/de/…`, `/uk/…`, `/us/…`). It fixes the content language, the UI texts, the market
 * and the currency: `de` is German in euros, `uk` English in pounds, `us` English in dollars.
 */
export const REGIONS = ["de", "uk", "us"] as const;
export type Region = (typeof REGIONS)[number];
export const isRegion = (value: unknown): value is Region => REGIONS.includes(value as Region);

/** NovaDB content language per region: `uk` and `us` share the English content. */
export const CULTURE: Record<Region, string> = { de: "de-DE", uk: "en-US", us: "en-US" };
/** Language tag for `<html lang>`, `hreflang` and number formatting. */
export const HTML_LANG: Record<Region, string> = { de: "de", uk: "en-GB", us: "en-US" };
/** The region of the other content language: where the German and English version of an object are looked up. */
export const OTHER_LANGUAGE_REGION: Record<Region, Region> = { de: "uk", uk: "de", us: "de" };
/** Short label and tooltip of a region in the header switch. */
export const REGION_LABEL: Record<Region, { short: string; title: string }> = {
  de: { short: "DE", title: "Deutschland · Euro" },
  uk: { short: "UK", title: "United Kingdom · Pound" },
  us: { short: "US", title: "United States · Dollar" },
};

export type Market = "EU" | "UK" | "US";
/** The price market of a region. */
export const MARKET: Record<Region, Market> = { de: "EU", uk: "UK", us: "US" };
const CURRENCY: Record<Market, string> = { EU: "EUR", US: "USD", UK: "GBP" };

/** The price in the region's currency and number format; "" where the product has no price in this market. */
export function formatPrice(value: number | undefined, market: Market, region: Region): string {
  if (value === undefined) return "";
  return new Intl.NumberFormat(HTML_LANG[region], { style: "currency", currency: CURRENCY[market] }).format(value);
}

/** The same content in every region: `own` is the path (without region) in the content language of `region`, `other` in the other one. */
export function alternatesOf(region: Region, own: string | undefined, other: string | undefined): Partial<Record<Region, string>> {
  const result: Partial<Record<Region, string>> = {};
  for (const r of REGIONS) {
    const path = CULTURE[r] === CULTURE[region] ? own : other;
    if (path !== undefined) result[r] = `/${r}/${path}`;
  }
  return result;
}

/**
 * Everything the site prints that is not content, from NovaDB, in one language:
 * - `texts`: UI texts, the type `merchLabel` (one object per key, the text per language; `{n}` and `{q}` are
 *   placeholders; a count has one label per plural form, `results.one`, `results.other`), and the names of the product
 *   attributes, read from their definitions (NovaDB's `typeAttribute`) and keyed by API identifier: the name an editor
 *   sees in the CMS is the name on the site.
 * - `values`: colours, materials and finishes, PIM objects a product references, by object ID: their name per language
 *   and, for a colour, its swatch.
 */
export type Labels = { texts: Record<string, string>; values: Record<string, PimValue> };
export type PimValue = { name?: string; hex?: string };

/** UI text key → the product attribute whose name it is. */
export const ATTRIBUTE_TEXT = {
  group: PRODUCT.group, sku: PRODUCT.sku, colour: PRODUCT.color, material: PRODUCT.materials, price: PRODUCT.price,
  availability: PRODUCT.inStock, volume: PRODUCT.cupVolume, finish: PRODUCT.finish, pieces: PRODUCT.pieces,
  screenSize: PRODUCT.screenSize,
} as const;

/** Plain texts: printed escaped. */
const PLAIN = [
  "siteName", "skip", "mainNav", "breadcrumb", "region", "home", "notFound",
  "search", "searchPlaceholder", "pagesFound", "products", "searchAll",
  "filter", "apply", "reset", "sort", "sortRelevance", "sortName", "sortPriceAsc", "sortPriceDesc",
  "inStock", "from", "to", "noResults", "showMore", "available", "soldOut", "similar",
  "addToCart", "cart", "subtotal", "checkout", "cartEmpty", "cartNotice",
] as const;
/** Texts that may carry inline HTML (links, emphasis): typed for `dangerouslySetInnerHTML` only, so no other use compiles. */
const HTML = ["poweredBy", "notFoundText"] as const;

export type Texts = Record<(typeof PLAIN)[number], string> & Record<(typeof HTML)[number], { __html: string }> &
  Record<keyof typeof ATTRIBUTE_TEXT, string> & {
  results: (n: number) => string;
  pieceCount: (n: number) => string;
  searchTitle: (q: string) => string;
  /** The name of a PIM value (colour, material, finish object, by ID) in this language. */
  value: (id: string) => string;
  /** The swatch of a colour (by ID), a CSS colour; undefined if the colour has none. */
  swatch: (id: string) => string | undefined;
};

const reported = new Set<string>();
/** A text the language lacks shows as `⟦key⟧`, never as another language's text, and is logged once per process. */
function missing(key: string, region: Region, where: string): string {
  if (!reported.has(`${region}:${key}`)) console.error(`'${key}' has no text in ${CULTURE[region]} (${where})`);
  reported.add(`${region}:${key}`);
  return `⟦${key}⟧`;
}

/** The texts of a region, built from its labels (`loadLabels`). */
export function t(labels: Labels, region: Region): Texts {
  const get = (key: string) => labels.texts[key] ?? missing(key, region, "merchLabel");
  const attribute = (identifier: string) => labels.texts[identifier] ?? missing(identifier, region, "attribute name");
  const plural = new Intl.PluralRules(HTML_LANG[region]);
  const count = (key: string) => (n: number) => get(`${key}.${plural.select(n)}`).replace("{n}", String(n));
  return {
    ...(Object.fromEntries(PLAIN.map((key) => [key, get(key)])) as Record<(typeof PLAIN)[number], string>),
    ...(Object.fromEntries(HTML.map((key) => [key, { __html: get(key) }])) as Record<(typeof HTML)[number], { __html: string }>),
    ...(Object.fromEntries(Object.entries(ATTRIBUTE_TEXT).map(([key, id]) => [key, attribute(id)])) as Record<keyof typeof ATTRIBUTE_TEXT, string>),
    results: count("results"),
    pieceCount: count("pieceCount"),
    searchTitle: (q) => (q ? get("searchTitle").replace("{q}", q) : get("searchTitle.empty")),
    value: (id) => labels.values[id]?.name ?? missing(`value ${id}`, region, "name of a colour, material or finish"),
    swatch: (id) => labels.values[id]?.hex,
  };
}

/** The texts of the current request: the root loader loads the labels once for every route. */
export function useText(): Texts {
  const root = useRouteLoaderData<typeof rootLoader>("root");
  if (!root) throw new Error("useText() needs the root loader's data");
  return t(root.labels, root.region);
}
