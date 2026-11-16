/** Products from the PIM: read from the Delivery API, with their released articles, pictures and claims. */
import { list, type NovaObject } from "./delivery.server";
import { CULTURE, type Market, type Region } from "./i18n";
import type { Image } from "./images";
import { toImages } from "./images.server";
import { cleanHtml, type Article, type Product } from "./products";
import {
  ARTICLE, CLAIM, MARKET_VARIANT, PRODUCT, SET_ITEM, TYPE, WORKFLOW_RELEASED,
} from "./schema";

/** Only what the workflow has released is on the site: `filter` narrows the released objects further. */
const releasedWith = (workflow: string, filter?: string) => [`${workflow} = ${WORKFLOW_RELEASED}`, filter].filter(Boolean).join(" && ");

const toArticle = (o: NovaObject): Article => ({
  id: o.meta.id,
  productId: o.props[ARTICLE.product],
  name: o.props[ARTICLE.name],
  sku: o.props[ARTICLE.number],
  color: o.props[ARTICLE.color] ? String(o.props[ARTICLE.color]) : undefined,
  stock: o.props[ARTICLE.stock] ?? 0,
  deliveryDays: o.props[ARTICLE.deliveryDays],
});

/** All released articles. */
async function loadArticles(region: Region): Promise<Article[]> {
  const { objs } = await list(TYPE.article, { lang: CULTURE[region], filter: releasedWith(ARTICLE.workflow) });
  return objs.map(toArticle);
}

/** `refs`: the objects the product read resolved (pictures, claims, set rows), by object ID. */
function toProduct(o: NovaObject, region: Region, articles: Article[], refs: Map<number, NovaObject>, images: Map<number, Image>): Product {
  const p = o.props;
  return {
    id: o.meta.id,
    name: p[PRODUCT.name],
    path: p[PRODUCT.urlSegment],
    url: `/${region}/${p[PRODUCT.urlSegment]}`,
    articles,
    materials: (p[PRODUCT.materials] ?? []).map(String),
    volume: p[PRODUCT.volume],
    finishes: (p[PRODUCT.finishes] ?? []).map(String),
    pieces: p[PRODUCT.pieces],
    screenSize: p[PRODUCT.screenSize],
    price: p[PRODUCT.price],
    image: images.get(p[PRODUCT.images]?.[0]),
    groupId: p[PRODUCT.group],
    descriptionHtml: p[PRODUCT.description]?.XML ? cleanHtml(p[PRODUCT.description].XML) : undefined,
    similar: p[PRODUCT.related] ?? [],
    accessories: p[PRODUCT.accessories] ?? [],
    spareParts: p[PRODUCT.spareParts] ?? [],
    claims: (p[PRODUCT.claims] ?? []).map((id: number) => refs.get(id)?.props[CLAIM.text]).filter(Boolean),
    setItems: (p[PRODUCT.setItems] ?? []).flatMap((id: number) => {
      const row = refs.get(id)?.props;
      return row ? [{ articleId: row[SET_ITEM.article], quantity: row[SET_ITEM.quantity] }] : [];
    }),
    seo: {
      title: p[PRODUCT.seoTitle],
      description: p[PRODUCT.seoDescription],
      noIndex: p[PRODUCT.seoNoIndex] === true,
      noFollow: p[PRODUCT.seoNoFollow] === true,
    },
    shopifyId: p[PRODUCT.shopifyId],
  };
}

/** Every released product matching a Delivery filter, or the first `take`; pictures, claims and set rows arrive in the same response (`resolve`). */
export async function loadProducts(region: Region, market: Market, filter?: string, sort?: string, take?: number): Promise<Product[]> {
  const [{ objs, refs }, articles] = await Promise.all([
    list(TYPE.product, {
      lang: CULTURE[region], variants: MARKET_VARIANT[market], filter: releasedWith(PRODUCT.workflow, filter), sort, take,
      resolve: [PRODUCT.images, PRODUCT.claims, PRODUCT.setItems].join(","),
    }),
    loadArticles(region),
  ]);
  const images = toImages(refs);
  const refsById = new Map(refs.map((o) => [o.meta.id, o]));
  const articlesOf = new Map<number, Article[]>();
  for (const a of articles) articlesOf.set(a.productId, [...(articlesOf.get(a.productId) ?? []), a]);
  return objs
    .filter((o) => o.props[PRODUCT.name] && o.props[PRODUCT.urlSegment])
    .map((o) => toProduct(o, region, articlesOf.get(o.meta.id) ?? [], refsById, images));
}

/** Products by ID, in the order of `ids` (the order an editor chose). */
export async function productsByIds(ids: number[], region: Region, market: Market): Promise<Product[]> {
  if (!ids.length) return [];
  const byId = new Map((await loadProducts(region, market, `meta.id = ${ids.join(", ")}`)).map((p) => [p.id, p]));
  return ids.flatMap((id) => byId.get(id) ?? []);
}

export async function productByPath(region: Region, market: Market, path: string): Promise<Product | undefined> {
  const [product] = await loadProducts(region, market, `${PRODUCT.urlSegment} = "${path.replace(/["\\]/g, "")}"`);
  return product;
}

/** The rows of a set product: how many of which article, linked to the article's product page (none if that is not on the site). */
export async function setContents(product: Product, region: Region, market: Market): Promise<{ quantity: number; name: string; url?: string }[]> {
  if (!product.setItems.length) return [];
  const all = new Map((await loadArticles(region)).map((a) => [a.id, a]));
  const rows = product.setItems.flatMap(({ articleId, quantity }) => (all.has(articleId) ? [{ quantity, article: all.get(articleId)! }] : []));
  const products = await productsByIds([...new Set(rows.map((r) => r.article.productId))], region, market);
  return rows.map(({ quantity, article }) => ({ quantity, name: article.name, url: products.find((p) => p.id === article.productId)?.url }));
}
