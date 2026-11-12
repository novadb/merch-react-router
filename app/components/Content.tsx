/** Renders a Visual Document (the page content) and the teasers it embeds. */
import type { JSX, ReactNode } from "react";
import { Link } from "react-router";
import { formatPrice, type Region, type Market, type Texts } from "~/lib/i18n";
import { srcSet } from "~/lib/images";
import { cleanHtml, type Product } from "~/lib/products";
import type { VNode } from "~/lib/site.server";

/** Everything a link or teaser in content can point at: pages and products, by object ID. */
export type Target = { url: string; title: string; image?: string };
/** `images`: the picture URL (`/media/{md5}{ext}`) of each image object the document embeds, by object ID. */
export type Ctx = { region: Region; market: Market; text: Texts; products: Record<number, Product>; targets: Record<number, Target>; images: Record<number, string> };

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
  const [first, ...rest] = node.children ?? [];
  const Tag = (node.element || "div") as keyof JSX.IntrinsicElements;
  // The root node (`visualComponentRoot`) comes from the CMS as `<div class="main">`: the `.main` of site.css.
  return (
    <Tag className={node.class}>
      {first &&<ContentNode node={first} ctx={ctx} />}
      {afterFirst}
      {rest.map((child, i) => <ContentNode key={i} node={child} ctx={ctx} />)}
    </Tag>
  );
}

function ContentNode({ node, ctx }: { node: VNode; ctx: Ctx }) {
  const Tag = (node.element || "div") as keyof JSX.IntrinsicElements;
  switch (node.type) {
    case "group":
      return <Tag className={node.class}>{node.children?.map((child, i) => <ContentNode key={i} node={child} ctx={ctx} />)}</Tag>;
    case "image":
      return node.objectId && ctx.images[node.objectId] ? <img className={node.class} src={ctx.images[node.objectId]} srcSet={srcSet(ctx.images[node.objectId])} sizes="(min-width: 760px) 50vw, 100vw" alt="" loading="lazy" /> : null;
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

/** Class names and HTML are read outside this file (`tests/site.spec.ts` selects `.product-card__*`) and copied by the other demos: change them only together. */
/** `eager`: the picture loads at once, not when it comes near the window (a range's first cards after a change, preloaded). */
export function ProductCard({ product: p, ctx, eager = false }: { product: Product; ctx: Ctx; eager?: boolean }) {
  const details = [
    p.color && ctx.text.value(p.color), p.volume && `${p.volume} ml`, p.screenSize && `${p.screenSize}″`,
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
          {p.inStock === false && <span className="badge badge--muted">{ctx.text.soldOut}</span>}
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
