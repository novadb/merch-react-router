/** `/{region}/{path}`: a CMS page (with its live product range) or a product from the PIM. */
import type { ShouldRevalidateFunctionArgs } from "react-router";
import type { Route } from "./+types/page";
import { Crumbs, imageIds, referencedIds, VisualDocument, type Ctx, type Target } from "~/components/Content";
import { ProductDetail } from "~/components/ProductDetail";
import { preloadPictures, Range } from "~/components/Range";
import type { Image } from "~/lib/images";
import { imagesByIds } from "~/lib/images.server";
import { alternatesOf, MARKET, OTHER_LANGUAGE_REGION, useText, type Market, type Region } from "~/lib/i18n";
import { rangeOf, type Product } from "~/lib/products";
import { loadProducts, productByPath, productsByIds } from "~/lib/products.server";
import { formOf, regionOf, notFound } from "~/lib/request";
import { PRODUCT } from "~/lib/schema";
import { seoOf } from "~/lib/seo";
import { breadcrumb, categoryPage, loadGroups, loadSite, type Page, type Site } from "~/lib/site.server";

const toTarget = (p: { url: string; title: string; imageId?: number }, images: Map<number, Image>): Target =>
  ({ url: p.url, title: p.title, image: p.imageId ? images.get(p.imageId)?.src : undefined });
/** The picture URL of each image a document embeds, by file object ID. */
function documentImages(content: Page["content"], images: Map<number, Image>): Record<number, string> {
  const urls: Record<number, string> = {};
  for (const id of imageIds(content)) {
    const image = images.get(id);
    if (image) urls[id] = image.src;
  }
  return urls;
}

/** A page in the breadcrumb, named as in the navigation. */
const toCrumb = (p: { url: string; navTitle: string }): Target => ({ url: p.url, title: p.navTitle });

/** What the content links to or teases: the pages and products it refers to, by object ID. */
function contentTargets(pages: Page[], products: Product[], images: Map<number, Image>): Record<number, Target> {
  const targets: Record<number, Target> = {};
  for (const page of pages) targets[page.id] = toTarget(page, images);
  for (const p of products) targets[p.id] = { url: p.url, title: p.name, image: p.image?.src };
  return targets;
}

export async function loader({ params, request }: Route.LoaderArgs) {
  const region = regionOf(params.region);
  const market = MARKET[region];
  const path = params["*"].replace(/^\/+|\/+$/g, "");
  const [site, groups] = await Promise.all([loadSite(region), loadGroups(region)]);
  const page = site.byPath.get(path);
  const data = page ? await pageData(site, page, groups, region, market)
    : await productData(site, groups, region, market, path);
  return { ...data, seo: seoOf(request, data.canonical, data.alternates) };
}

/** The live range of a category page: the products of its groups; null for a page without one. */
async function pageRange(page: Page, region: Region, form: URLSearchParams) {
  if (!page.groupRefs.length) return null;
  const products = await loadProducts(region, MARKET[region], `${PRODUCT.group} = ${page.groupRefs.join(", ")}`);
  return products.length ? rangeOf(products, form, "name") : null;
}

async function pageData(site: Site, page: Page, groups: Map<number, string>, region: Region, market: Market) {
  // An ID the content refers to is a page of the site, else a product.
  const refs = [...referencedIds(page.content)];
  const linked = refs.flatMap((ref) => site.pages.get(ref) ?? []);
  const wantedImages = imageIds(page.content); // plus the teaser picture of every page referred to
  for (const p of linked) if (p.imageId) wantedImages.add(p.imageId);
  // The other language's page tree is for the hreflang links of a page; a product has no use for it.
  const [embedded, range, images, otherSite] = await Promise.all([
    productsByIds(refs.filter((ref) => !site.pages.has(ref)), region, market),
    pageRange(page, region, new URLSearchParams()),
    imagesByIds([...wantedImages]),
    loadSite(OTHER_LANGUAGE_REGION[region]),
  ]);
  return {
    kind: "page" as const, region, market,
    canonical: page.url,
    title: page.title,
    alternates: alternatesOf(region, page.path, otherSite.pages.get(page.id)?.path),
    crumbs: breadcrumb(site, page).map(toCrumb),
    content: page.content,
    products: Object.fromEntries(embedded.map((p) => [p.id, p])),
    targets: contentTargets(linked, embedded, images),
    images: documentImages(page.content, images),
    range,
    groupNames: Object.fromEntries(groups),
  };
}

async function productData(site: Site, groups: Map<number, string>, region: Region, market: Market, path: string) {
  const product = (path && (await productByPath(region, market, path))) || notFound();
  const [similar, [other]] = await Promise.all([productsByIds(product.similar, region, market), productsByIds([product.id], OTHER_LANGUAGE_REGION[region], market)]);
  const category = product.groupId ? categoryPage(site, product.groupId) : undefined;
  return {
    kind: "product" as const, region, market,
    canonical: product.url,
    title: product.name,
    alternates: alternatesOf(region, product.path, other?.path),
    product, similar,
    groupName: product.groupId ? groups.get(product.groupId) : undefined,
    crumbs: [...breadcrumb(site, category).map(toCrumb), { url: product.url, title: product.name }],
  };
}

/**
 * The range form (facets, sorting, "Show more") posts to the page itself and gets the range for its fields. Without
 * JavaScript the browser posts it and React Router renders the page with this answer; in the browser the range's fetcher
 * posts it, and the page stays as it is.
 */
export async function action({ params, request }: Route.ActionArgs) {
  const region = regionOf(params.region);
  const page = (await loadSite(region)).byPath.get(params["*"].replace(/^\/+|\/+$/g, "")) ?? notFound();
  return { range: (await pageRange(page, region, await formOf(request))) ?? notFound() };
}

/** In the browser the pictures of the answer's first cards are loaded before it is shown: none pops in. */
export async function clientAction({ serverAction }: Route.ClientActionArgs) {
  const answer = await serverAction();
  await preloadPictures(answer.range.items);
  return answer;
}

/** A posted range changes the range only: the page around it is not loaded again. */
export const shouldRevalidate = ({ formMethod, defaultShouldRevalidate }: ShouldRevalidateFunctionArgs) => !formMethod && defaultShouldRevalidate;

// `posted`: the answer to the range form, posted without JavaScript.
export default function PageRoute({ loaderData: data, actionData: posted }: Route.ComponentProps) {
  const text = useText();
  // React 19 moves <title> and <link> from anywhere in the tree into <head>.
  const head = (
    <>
      <title>{`${data.title} · ${text.siteName}`}</title>
      <link rel="canonical" href={data.seo.canonical} />
      {data.seo.alternates.map((a) => <link key={a.hreflang} rel="alternate" hrefLang={a.hreflang} href={a.href} />)}
    </>
  );
  const crumbs = <Crumbs items={data.crumbs} label={text.breadcrumb} />;
  if (data.kind === "product") {
    const ctx: Ctx = { region: data.region, market: data.market, text, products: {}, targets: {}, images: {} };
    return <>{head}{crumbs}<ProductDetail ctx={ctx} product={data.product} groupName={data.groupName} similar={data.similar} /></>;
  }
  const ctx: Ctx = { region: data.region, market: data.market, text, products: data.products, targets: data.targets, images: data.images };
  // `key`: another page starts a new range; `Range` shows its fetcher's answer for as long as it lives, not the loader's data.
  const range = data.range && <Range key={data.canonical} ctx={ctx} range={posted?.range ?? data.range} groupNames={data.groupNames} />;
  return <>{head}{crumbs}<VisualDocument node={data.content} ctx={ctx} afterFirst={range} /></>;
}
