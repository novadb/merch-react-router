/** Renders a Visual Document (the page content) and the teasers it embeds. */
import type { JSX, ReactNode } from "react";
import { Link } from "react-router";
import { formatPrice, type Region, type Market, type Texts } from "~/lib/i18n";
import { srcSet } from "~/lib/images";
import { cleanHtml, colorsOf, inStockOf, type Product } from "~/lib/products";
import type { VNode } from "~/lib/site.server";

/** Everything a link or teaser in content can point at: pages and products, by object ID. */
export type Target = { url: string; title: string; image?: string };
/**
 * `images`: the picture URL (`/media/{md5}/original{ext}`) of each image object the document embeds, by object ID.
 * `firstImage`: the first picture of the document, which `VisualDocument` sets; it loads at once, as the others do not.
 */
export type Ctx = { region: Region; market: Market; text: Texts; products: Record<number, Product>; targets: Record<number, Target>; images: Record<number, string>; firstImage?: VNode };

/** Object IDs a document refers to: embedded objects and links inside rich text. */
export function referencedIds(node: VNode | undefined, into = new Set<number>()): Set<number> {
  if (!node) return into;
  if (node.objectId && node.type === "object") into.add(node.objectId);
  for (const m of node.content?.matchAll(/objectId=(\d+)/g) ?? []) into.add(Number(m[1]));
  node.children?.forEach((child) => referencedIds(child, into));
  return into;
}

/** Object IDs of the images a document embeds. */
export function imageIds(node: VNode | undefined, into = new Set<number>()): Set<number> {
  if (!node) return into;
  if (node.objectId && node.type === "image") into.add(node.objectId);
  node.children?.forEach((child) => imageIds(child, into));
  return into;
}

/** The first image node in document order that `ContentNode` renders. */
function firstImage(node: VNode, images: Ctx["images"]): VNode | undefined {
  if (node.type === "image" && node.objectId && images[node.objectId]) return node;
  for (const child of node.children ?? []) {
    const found = firstImage(child, images);
    if (found) return found;
  }
}

/** Turns CMS links (`object?branch=…&objectId=N`) into site URLs and drops editor-only attributes. */
function rewriteLinks(html: string, targets: Record<number, Target>): string {
  return cleanHtml(html)
    .replace(/href="\/?object\?branch=[^&"]+&amp;objectId=(\d+)"/g, (_, id) => `href="${targets[Number(id)]?.url ?? "#"}"`)
    .replace(/\sdata-nova-[a-z]+="[^"]*"/g, "");
}

/** The breadcrumb of a page or product: the trail from the home page, the last item being the page itself. The home page has none. */
export function Crumbs({ items, label }: { items: Target[]; label: string }) {
  if (items.length < 2) return null;
  return (
    <nav className="crumbs" aria-label={label}>
      <ol>
        {items.map((item, i) => (
          <li key={item.url}>{i === items.length - 1 ? <span aria-current="page">{item.title}</span> : <Link to={item.url}>{item.title}</Link>}</li>
        ))}
      </ol>
    </nav>
  );
}

/** Renders the document; `afterFirst` (the live range) goes right after its first component, the hero. */
export function VisualDocument({ node, ctx, afterFirst }: { node?: VNode; ctx: Ctx; afterFirst?: ReactNode }) {
  if (!node) return <>{afterFirst}</>;
  // Derived from the tree on every render, so server and browser agree; a flag set while rendering would flip on a second render.
  ctx = { ...ctx, firstImage: firstImage(node, ctx.images) };
  const [first, ...rest] = node.children ?? [];
  const Tag = (node.element || "div") as keyof JSX.IntrinsicElements;
  // The root node (`merchComponentRoot`) comes from the CMS as `<div class="main">`: the `.main` of site.css.
  return (
    <Tag className={node.class}>
      {first &&<ContentNode node={first} ctx={ctx} />}
      {afterFirst}
      {rest.map((child, i) => <ContentNode key={i} node={child} ctx={ctx} />)}
    </Tag>
  );
}

/** `sizes` of a content picture: half a page beside text; the chapter's text column when it stands straight in a chapter, where site.css shows it wide. */
const CONTENT_SIZES = "(min-width: 760px) 50vw, 100vw";
const CHAPTER_SIZES = "(min-width: 1280px) 1024px, (min-width: 760px) 78vw, 100vw";

function ContentNode({ node, ctx, sizes = CONTENT_SIZES }: { node: VNode; ctx: Ctx; sizes?: string }) {
  const Tag = (node.element || "div") as keyof JSX.IntrinsicElements;
  switch (node.type) {
    case "group": {
      // A chapter hands its own `sizes` to its children, and the picture's figure on to the picture; any other group starts again.
      const childSizes = node.class === "merchChapter" ? CHAPTER_SIZES : node.class === "imageWithCaption" ? sizes : CONTENT_SIZES;
      return <Tag className={node.class}>{node.children?.map((child, i) => <ContentNode key={i} node={child} ctx={ctx} sizes={childSizes} />)}</Tag>;
    }
    case "image": {
      if (!node.objectId || !ctx.images[node.objectId]) return null;
      // The first picture is on screen at once (the hero): lazy loading would delay the largest contentful paint.
      const first = node === ctx.firstImage;
      return <img className={node.class} src={ctx.images[node.objectId]} srcSet={srcSet(ctx.images[node.objectId])} sizes={sizes} alt="" loading={first ? "eager" : "lazy"} fetchPriority={first ? "high" : undefined} />;
    }
    case "object": {
      // Like the CMS, which wraps what an object component renders in the component's own element: the editor's
      // stylesheet (built from site.css) then matches the same DOM as the site.
      const product = node.objectId ? ctx.products[node.objectId] : undefined;
      const target = node.objectId ? ctx.targets[node.objectId] : undefined;
      if (product) return <Tag className={node.class}><ProductCard product={product} ctx={ctx} /></Tag>;
      return target ? <Tag className={node.class}><PageTeaser target={target} /></Tag> : null;
    }
    default:
      return <Tag className={node.class} dangerouslySetInnerHTML={{ __html: rewriteLinks(node.content ?? "", ctx.targets) }} />;
  }
}

/** `sizes` of a card's picture: also the picture `preloadPictures` (`Range.tsx`) loads ahead. */
export const CARD_SIZES = "(min-width: 700px) 320px, 100vw";

// Class names and HTML are read outside this file (the shared suite selects `.product-card__*`) and copied by the other demos: change them only together.
/** `eager`: the picture loads at once, not when it comes near the window (a range's first cards after a change, preloaded). */
export function ProductCard({ product: p, ctx, eager = false }: { product: Product; ctx: Ctx; eager?: boolean }) {
  const details = [
    ...colorsOf(p).map(ctx.text.value), p.volume && `${p.volume} ml`, p.screenSize && `${p.screenSize}″`,
    ...p.materials.map(ctx.text.value), ...p.finishes.map(ctx.text.value),
    p.pieces && p.pieces > 1 && ctx.text.pieceCount(p.pieces),
  ].filter(Boolean);
  return (
    <article className="product-card">
      <Link to={p.url} className="product-card__link">
        <div className="product-card__media">
          {p.image && <img src={p.image.src} srcSet={srcSet(p.image.src)} sizes={CARD_SIZES} alt={p.name} loading={eager ? "eager" : "lazy"} width={400} height={400} />}
        </div>
        <h3 className="product-card__name">{p.name}</h3>
        <p className="product-card__meta">{details.join(" · ")}</p>
        <p className="product-card__price">
          {formatPrice(p.price, ctx.market, ctx.region)}
          {inStockOf(p) === false && <span className="badge badge--muted">{ctx.text.soldOut}</span>}
        </p>
      </Link>
    </article>
  );
}

function PageTeaser({ target }: { target: Target }) {
  return (
    <Link className="page-teaser" to={target.url}>
      {target.image && <img src={target.image} srcSet={srcSet(target.image)} sizes="(min-width: 760px) 33vw, 100vw" alt="" loading="lazy" />}
      <span className="page-teaser__title">{target.title}</span>
    </Link>
  );
}
