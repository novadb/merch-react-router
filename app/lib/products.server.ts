/** Products from the PIM: read from the Delivery API, with their pictures. */
import { list, type NovaObject } from "./delivery.server";
import { CULTURE, type Market, type Region } from "./i18n";
import type { Image } from "./images";
import { toImages } from "./images.server";
import { cleanHtml, type Product } from "./products";
import { MARKET_VARIANT, PRODUCT, TYPE } from "./schema";

function toProduct(o: NovaObject, region: Region, images: Map<number, Image>): Product {
  const p = o.props;
  return {
    id: o.meta.id,
    name: p[PRODUCT.name],
    path: p[PRODUCT.urlSegment],
    url: `/${region}/${p[PRODUCT.urlSegment]}`,
    sku: p[PRODUCT.sku],
    color: p[PRODUCT.color] ? String(p[PRODUCT.color]) : undefined,
    materials: (p[PRODUCT.materials] ?? []).map(String),
    volume: p[PRODUCT.cupVolume],
    finishes: (p[PRODUCT.finish] ?? []).map(String),
    pieces: p[PRODUCT.pieces],
    screenSize: p[PRODUCT.screenSize],
    price: p[PRODUCT.price],
    inStock: p[PRODUCT.inStock],
    image: images.get(p[PRODUCT.images]?.[0]),
    groupId: p[PRODUCT.group],
    descriptionHtml: p[PRODUCT.description]?.XML ? cleanHtml(p[PRODUCT.description].XML) : undefined,
    similar: p[PRODUCT.similar] ?? [],
    shopifyId: p[PRODUCT.shopifyId],
  };
}

/** Every product matching a Delivery filter, or the first `take`; the pictures arrive in the same response (`resolve`). */
export async function loadProducts(region: Region, market: Market, filter?: string, sort?: string, take?: number): Promise<Product[]> {
  const { objs, refs } = await list(TYPE.product, { lang: CULTURE[region], variants: MARKET_VARIANT[market], filter, sort, take, resolve: PRODUCT.images });
  const images = toImages(refs);
  return objs.filter((o) => o.props[PRODUCT.name] && o.props[PRODUCT.urlSegment]).map((o) => toProduct(o, region, images));
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
